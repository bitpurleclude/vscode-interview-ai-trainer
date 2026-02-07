# Directory Map and Responsibilities

```text
interview-trainer/
|-- assets/                               # Extension icons and static assets
|-- config/                               # Default config (api/skill/templates/providers)
|-- scripts/                              # Build and utility scripts
|-- src/
|   |-- extension.ts                      # Extension entry
|   |-- protocol/                         # Shared protocol contracts
|   |-- webview/                          # Webview provider + protocol bridge
|   `-- interviewTrainer/
|       |-- interface/                    # Input boundary (commands, webview handlers)
|       |-- application/                  # Use-case orchestration, services, analysis flows
|       |-- domain/                       # Pure business logic and algorithms
|       |-- infra/                        # API/storage/recording/logging implementations
|       |-- protocol/                     # Layer notes placeholder
|       `-- InterviewTrainerExtension.ts  # Extension host (lifecycle and state aggregation)
|-- webview/
|   `-- src/                              # React pages, hooks, components, messaging
|-- build/                                # VSIX package output
|-- out/                                  # Compiled extension output
`-- media/                                # Compiled webview assets
```

## Key Areas
- `src/interviewTrainer/interface/handlers/`: Webview event entry and routing with capability ports.
- `src/interviewTrainer/application/useCases/`: use-case entry points consumed by handlers.
- `src/interviewTrainer/application/flows/analyze/`: staged analysis orchestration.
- `src/interviewTrainer/application/services/`: gateways, state helpers, logging, config helpers.
- `src/interviewTrainer/domain/`: pure logic modules without I/O.
- `src/interviewTrainer/infra/`: external system integrations and persistence.
- `webview/src/`: frontend UI, state, and backend messaging.

## Excluded from Engineering Docs
- `node_modules/`, `build/`, `out/`, and `media/` are dependency/build outputs.

## Dependency Direction
- Interface -> Application -> (Domain, Infra)
- Domain can depend only on Domain/Protocol and must not import `vscode`, `fs`, `path`, or Infra.
- Infra can be called by Application but must not call back into Interface.

## Documentation Sync Rule
When folder structure or responsibility changes, update at least:
- `docs/architecture/ARCHITECTURE_OVERVIEW.md`
- `docs/architecture/DIRECTORY_MAP.md`
- Matching files in `docs/modules/*`
