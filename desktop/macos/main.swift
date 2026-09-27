import AppKit
import WebKit

// A local menu-bar companion. All data and permissions remain in the web app.
// No duplicated store, embedded credentials, network integrations or telemetry.
@MainActor
final class VougaApp: NSObject, NSApplicationDelegate, WKNavigationDelegate {
    private var item: NSStatusItem!
    private let popover = NSPopover()
    private var webView: WKWebView!
    private let base = URL(string: "http://127.0.0.1:3100")!

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 420, height: 690), configuration: configuration)
        webView.navigationDelegate = self
        webView.setValue(false, forKey: "drawsBackground")
        let controller = NSViewController()
        controller.view = webView
        popover.contentViewController = controller
        popover.contentSize = NSSize(width: 420, height: 690)
        popover.behavior = .transient
        item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        if let button = item.button {
            if let path = Bundle.main.path(forResource: "vouga-mark", ofType: "png"), let image = NSImage(contentsOfFile: path) {
                image.size = NSSize(width: 18, height: 18)
                image.isTemplate = true
                button.image = image
            } else { button.title = "V" }
            button.toolTip = "Vouga OS — o essencial"
            button.setAccessibilityLabel("Vouga OS — abrir painel rápido")
            button.target = self
            button.action = #selector(toggle)
            button.sendAction(on: [.leftMouseUp, .rightMouseUp])
        }
        loadPanel()
    }

    @objc private func toggle() {
        guard let button = item.button else { return }
        if NSApp.currentEvent?.type == .rightMouseUp {
            let menu = NSMenu()
            let open = menu.addItem(withTitle: "Abrir workspace", action: #selector(openWorkspace), keyEquivalent: "")
            open.target = self
            let reload = menu.addItem(withTitle: "Recarregar painel", action: #selector(loadPanel), keyEquivalent: "")
            reload.target = self
            menu.addItem(.separator())
            menu.addItem(withTitle: "Sair do Vouga OS", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
            item.menu = menu
            button.performClick(nil)
            item.menu = nil
            return
        }
        if popover.isShown { popover.performClose(nil) }
        else {
            popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
            NSApp.activate(ignoringOtherApps: true)
            popover.contentViewController?.view.window?.makeKey()
        }
    }

    @objc private func loadPanel() { webView.load(URLRequest(url: base.appendingPathComponent("painel"))) }
    @objc private func openWorkspace() { NSWorkspace.shared.open(base) }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if url.scheme == "about" { decisionHandler(.allow); return }
        let isLocal = url.scheme == "http" && url.host == "127.0.0.1" && url.port == 3100
        if isLocal && (action.targetFrame != nil) { decisionHandler(.allow); return }
        if action.navigationType == .linkActivated && ["https", "http"].contains(url.scheme ?? "") {
            NSWorkspace.shared.open(url)
        }
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        let html = """
        <!doctype html><html lang="pt-PT"><meta name="viewport" content="width=device-width,initial-scale=1">
        <style>body{background:#f1f0eb;color:#23251f;font:14px -apple-system,sans-serif;padding:32px;line-height:1.6}h1{font-size:24px;font-weight:500}p{color:#686a60}a{color:#8c4d0c}code{font-size:13px}</style>
        <h1>O Vouga OS está fechado.</h1><p>Inicia a aplicação local na pasta do projeto:</p><code>bun run dev</code>
        <p><a href="http://127.0.0.1:3100/painel">Voltar a tentar</a></p></html>
        """
        webView.loadHTMLString(html, baseURL: base)
    }
}

MainActor.assumeIsolated {
    let app = NSApplication.shared
    let delegate = VougaApp()
    app.delegate = delegate
    withExtendedLifetime(delegate) { app.run() }
}
