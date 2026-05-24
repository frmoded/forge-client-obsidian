"""V1 read-only manifest reader for the Pyodide-bundled engine.

Upstream forge.core.manifest has full read/write/validate, but the
write + validate paths pull in tomli_w, packaging, and
forge.installer.exceptions — none of which we want to ship in a
plugin asset bundle. V1's plugin engine only NEEDS the read path
(via SnippetRegistry._scan_library_vault and _auto_set_resolution_order,
which use `.name` and `.dependencies` and nothing else).

Validation isn't required: any forge.toml that reaches this code path
has already been validated upstream when its library was published
to the registry. We accept whatever the file says.

Mirrors the upstream public API surface:
  read_manifest(vault_dir) -> Manifest
  Manifest(name, version, description, dependencies, domains)
  Dependency(name, version)

If/when the plugin gains write-side flows (snippet authoring, dep
management), revisit by either bundling the full upstream module
or splitting upstream into read-only + write-side modules.
"""
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional

try:
  import tomllib
except ImportError:
  # Python <3.11 fallback. Pyodide 0.29 ships Python 3.13 so this
  # branch is unreachable today, but keeps the shim portable.
  import tomli as tomllib  # type: ignore

MANIFEST_FILENAME = "forge.toml"


@dataclass(frozen=True)
class Dependency:
  name: str
  version: str


@dataclass(frozen=True)
class Manifest:
  name: str
  version: str
  description: str
  dependencies: List[Dependency] = field(default_factory=list)
  # Domain scoping (constitution B9). None = field absent ("all
  # registered domains"); [] = core-only opt-out; ["moda", ...] =
  # specific. Read-through; not validated here.
  domains: Optional[List[str]] = None


def read_manifest(vault_dir) -> Manifest:
  """Read a vault's forge.toml. Raises FileNotFoundError when the
  file is absent (mirrors upstream's ValidationError shape via
  the same exception class hierarchy — both subclass Exception, and
  callers in snippet_registry.py just `except Exception as e`)."""
  path = Path(vault_dir) / MANIFEST_FILENAME
  if not path.is_file():
    raise FileNotFoundError(f"manifest not found at {path}")
  with open(path, "rb") as f:
    raw = tomllib.load(f)

  deps_raw = raw.get("dependencies", []) or []
  deps: List[Dependency] = []
  for entry in deps_raw:
    if isinstance(entry, dict) and "name" in entry and "version" in entry:
      deps.append(Dependency(name=entry["name"], version=entry["version"]))

  return Manifest(
    name=raw.get("name", ""),
    version=raw.get("version", ""),
    description=raw.get("description", ""),
    dependencies=deps,
    domains=raw.get("domains"),
  )
