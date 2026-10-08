# Working on this project

This is the independent, local Vouga OS rebuild. The previous repository is a read-only reference. The user authorized reuse of its Supabase project in isolated schema vouga_next; never alter its legacy tables.

- Exactly two roles: admin and engineer. Authorization belongs on the server.
- Primary areas: Home, Tasks, Calendar, CRM and active Projects in the sidebar. Ask or capture opens the shared Agent side panel. Home has My tasks (five doing/todo including undated), Next event with context, Needs me (Review/PRs/Agent) and existing due Follow-ups. Inbox is unorganized captures only, not notifications. Notes stay searchable/Agent-readable without a permanent wall. GitHub review identity is explicit member.githubLogin, not inferred from names. Tasks/projects default to Board. Calendar supports Office/Contacto (Google) and OS-only personal calendars, with multi-calendar destinations. Admin can access all calendars; engineer can access only Contacto and their own personal calendar. Tasks support multiple assigneeIds. Private tasks are personal; Board visibility is restricted to Miguel and Roque (legacy afonso ID), including against other admins. Active team: Miguel/Roque admins; Ana/Pedro/Vasco engineers. Internal participants determine Home agenda and Telegram recipients; grouped events must not duplicate reminders.
- Use the neutral black/grey workspace system: wide sidebar with small navigation, open lists, rounded month tiles, compact filter popovers and freeform composers with pill properties. Calendar has Week and Month only; choosing a month day opens its agenda panel. No generic dashboards or decorative metrics.
- External services live in src/services; use docs/INTEGRATIONS.md. Secrets stay server-side. Do not claim a provider is connected before authorization/health checks. Web and Telegram use the same Agent tools and transcription service. Integration tests mock provider calls. Production is hosted at os.vouga-agency.pt; do not deploy or push without explicit authorization.
- Dates use Europe/Lisbon. Persist instants in UTC and calendar-only dates as YYYY-MM-DD.
- Preserve single sources of truth, atomic captures, optimistic versions and server-filtered projections.
- Local data lives in .local; do not commit it, secrets, builds or node_modules.
- Use `bun run typecheck`, `bun run lint`, `bun run test`, and `bun run build` for changes affecting functionality. Validate UI in the browser when changing it.
- The macOS companion reuses /painel; it must not create a separate store.
- Do not initialize Git, create a remote, commit, push or deploy until the user explicitly requests that next step.
