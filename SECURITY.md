# Security and operational limits

## Reporting vulnerabilities

Report suspected vulnerabilities using [GitHub private vulnerability reporting](https://github.com/JerrettDavis/symbiosis-lab/security/advisories/new).
Include the affected commit/version, reproduction steps, and impact. Do not open a
public issue with exploit details. The latest `main` and latest alpha release are
supported; fixes may require upgrading. There is no guaranteed response SLA.

## Deployment boundary

This is a local scientific toy. It has no login, tenant isolation, role-based permissions, quota system, or audit-grade logging. Anyone who can reach its HTTP port can control and replace the world. Keep the default loopback binding. Do not publish the service directly to the Internet.

The running app uses no external APIs, remote fonts, model downloads, shell execution, dynamic code evaluation, or network access from cells. Genomes contain bounded numerical data, not executable code. No host directory or Docker socket is mounted by Compose. Build-time npm and image downloads are separate from runtime behavior.

HTTP writes require JSON and reject mismatching Origin headers. Static paths are constrained to the public directory. There is a restrictive Content Security Policy. Snapshot inputs enforce a version, array sizes, coordinates, finite numeric bounds, unique cell identities/positions, gene dimensions, and history limits. Request bodies are limited to 16 MiB. Manual ticks and rates are bounded. These controls reduce accidents and malformed input risks; they are not a hardened multi-user boundary, anti-DNS-rebinding guarantee, or denial-of-service defense.

Importing an untrusted but structurally valid snapshot can choose arbitrary permitted cell populations, fields, and ledger values. Validation establishes shape and range, not the scientific authenticity or provenance of a checkpoint. Treat exported state as untrusted experimental input when sharing it.

Secrets and user files should not be placed in the simulation's data directory. Back up important snapshots outside the single rolling checkpoint. A disk-full condition is surfaced in the UI/health endpoint. `/healthz` means the process serves requests; inspect `lastSaveError` for persistence failures.

Compose includes a non-root user, read-only root filesystem, dropped capabilities, a named data volume, PID and memory limits, and loopback exposure. Those runtime controls need verification on your Docker host. The supplied Docker smoke test exercises deployment and checkpoint recovery. The base-image tag follows Node 24 security updates rather than pinning a digest; pin and scan a known image digest for controlled deployments.
