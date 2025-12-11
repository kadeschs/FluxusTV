## Security Status
- All direct dependencies updated to safe versions.
- Remaining audit warnings are transitive:
  - `router` → vulnerable `path-to-regexp`
  - `external-editor` → vulnerable `tmp`
- These are upstream issues in `stremio-addon-sdk` and `inquirer`.
- No exploitable paths in FluxusTV addon code. Will patch once upstream releases fixes.
