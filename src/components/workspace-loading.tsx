import { DarkGradientBg } from "./ui/elegant-dark-pattern";

/** Shared by streamed route loading and the successful-login handoff. */
export function WorkspaceLoading() {
  return (
    <div className="workspace-loading" role="status" aria-label="A carregar o Vouga OS" aria-busy="true">
      <DarkGradientBg className="workspace-loading-background">
        <div className="workspace-loading-center" aria-hidden="true">
          <div className="workspace-loading-symbol" />
        </div>
      </DarkGradientBg>
    </div>
  );
}
