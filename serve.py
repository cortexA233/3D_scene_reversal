#!/usr/bin/env python3
"""Local dev server for the gt_designer Three.js scene.

The scene is a static ES-module page: it needs real HTTP (modules + fetch of the
.glb/.json assets are blocked over file://), correct MIME types, and concurrent
connections so the 70 MB of assets don't load one at a time.

    ./serve.py                # serve on :8000 (or the next free port) and open a browser
    ./serve.py --lab          # open the isolated single-mesh reference scene
    ./serve.py --replacement  # open the reference-independent procedural scene
    ./serve.py --evaluation   # open the fixed-view Evaluation Harness
    ./serve.py --stage-1-5    # open replacements in the eight-slot Lab layout
    ./serve.py --port 5173    # pick the port
    ./serve.py --no-open      # don't launch a browser
    ./serve.py --quiet        # only log errors (default logs errors + slow/large hits)
    ./serve.py --local-three  # use an installed three package instead of the CDN

By default index.html's importmap pulls three@0.170.0 from jsDelivr. --local-three
mounts an installed copy of the package at /vendor/three/ and rewrites that importmap
on the fly (the file on disk is never touched), which makes the scene work offline.
"""

import argparse
import http.server
import io
import re
import socket
import socketserver
import subprocess
import sys
import threading
import urllib.request
import webbrowser
from functools import partial
from pathlib import Path

ROOT = Path(__file__).resolve().parent / "gt_designer"
DEV_TOOLS_ROOT = Path(__file__).resolve().parent / "tools"
CDN_PROBE = "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js"
TARGET_THREE = "0.170.0"  # the version index.html's importmap pins

VENDOR_PREFIX = "/vendor/three/"
DEV_TOOLS_PREFIX = "/dev-tools/"
# Rewrites the two importmap entries; anything else in the map is left alone.
IMPORTMAP_RE = re.compile(
    r'"three":\s*"[^"]*"(\s*,\s*)"three/addons/":\s*"[^"]*"'
)
LOCAL_IMPORTS = (
    f'"three": "{VENDOR_PREFIX}build/three.module.js"\\1'
    f'"three/addons/": "{VENDOR_PREFIX}examples/jsm/"'
)

# Python's mimetypes DB is thin (and version-dependent) for these; pin them so the
# browser accepts the module scripts and the Draco wasm decoder.
EXTRA_TYPES = {
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".json": "application/json",
    ".wasm": "application/wasm",
    ".glb": "model/gltf-binary",
    ".gltf": "model/gltf+json",
    ".hdr": "image/vnd.radiance",
    ".exr": "image/x-exr",
    ".ktx2": "image/ktx2",
}


def find_three() -> Path:
    """Locate an installed three package: project-local first, then npm's global root.

    A global install is invisible to the browser on its own — bare specifiers like
    "three" are Node's resolution algorithm, not the web's — so we have to mount the
    directory over HTTP and point the importmap at it.
    """
    candidates = [
        ROOT / "node_modules" / "three",
        ROOT.parent / "node_modules" / "three",
    ]
    try:
        global_root = subprocess.run(
            ["npm", "root", "-g"], capture_output=True, text=True, timeout=15, check=True
        ).stdout.strip()
        if global_root:
            candidates.append(Path(global_root) / "three")
    except (OSError, subprocess.SubprocessError):
        pass

    for path in candidates:
        if (path / "build" / "three.module.js").is_file():
            return path
    sys.exit(
        "--local-three: no three package found in:\n  "
        + "\n  ".join(str(c) for c in candidates)
        + "\ninstall one with:  npm install three   (or drop --local-three to use the CDN)"
    )


def three_version(pkg: Path) -> str:
    try:
        import json

        return json.loads((pkg / "package.json").read_text()).get("version", "?")
    except Exception:
        return "?"


class SceneHandler(http.server.SimpleHTTPRequestHandler):
    """Static handler with no-cache headers so edits show up on reload."""

    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, **EXTRA_TYPES}
    quiet = False
    three_dir = None  # set when --local-three is in play

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()

    def translate_path(self, path):
        if self.three_dir and path.startswith(VENDOR_PREFIX):
            # Re-enter the parent's sanitizer with three's directory as the base so
            # its ".." handling still applies.
            saved, self.directory = self.directory, str(self.three_dir)
            try:
                return super().translate_path("/" + path[len(VENDOR_PREFIX):])
            finally:
                self.directory = saved
        if path.startswith(DEV_TOOLS_PREFIX):
            # Evaluation-only browser modules live outside gt_designer so the
            # replacement runtime cannot import them accidentally.
            saved, self.directory = self.directory, str(DEV_TOOLS_ROOT)
            try:
                return super().translate_path("/" + path[len(DEV_TOOLS_PREFIX):])
            finally:
                self.directory = saved
        return super().translate_path(path)

    def send_head(self):
        if self.three_dir and self.path.split("?")[0].rstrip("/") in ("", "/index.html"):
            return self.send_patched_index()
        return super().send_head()

    def send_patched_index(self):
        """Serve index.html with its CDN importmap swapped for the mounted copy."""
        html, n = IMPORTMAP_RE.subn(LOCAL_IMPORTS, (ROOT / "index.html").read_text())
        if not n:
            sys.stderr.write(
                "  ! couldn't find the three/three-addons importmap entries in index.html;\n"
                "    serving it unmodified, so the page will still hit the CDN\n"
            )
        body = html.encode()
        self.send_response(200)
        self.send_header("Content-type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        return io.BytesIO(body)

    def log_message(self, fmt, *args):
        # A full page load is hundreds of requests; only surface what matters.
        status = args[1] if len(args) > 1 else ""
        if str(status).startswith(("4", "5")):
            sys.stderr.write("  %s  %s\n" % (status, self.path))
        elif not self.quiet and self.path in ("/", "/index.html"):
            sys.stderr.write("  page load: %s\n" % self.path)

    def log_error(self, *args):
        pass  # errors are already reported through log_message


class Server(socketserver.ThreadingTCPServer):
    daemon_threads = True
    allow_reuse_address = True


def pick_port(preferred: int, tries: int = 20) -> int:
    for port in range(preferred, preferred + tries):
        with socket.socket() as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    sys.exit(f"no free port in {preferred}..{preferred + tries - 1}")


def check_cdn() -> None:
    """The importmap pulls three.js from jsDelivr — warn early if that's unreachable."""
    try:
        req = urllib.request.Request(CDN_PROBE, method="HEAD")
        urllib.request.urlopen(req, timeout=4)
    except Exception as exc:
        print(
            f"  ! warning: can't reach the three.js CDN ({exc.__class__.__name__}).\n"
            f"    index.html loads three@0.170.0 from jsdelivr, so the scene needs\n"
            f"    network access on first load (the browser caches it afterwards).\n"
            f"    --local-three serves an installed copy instead.",
            file=sys.stderr,
            flush=True,
        )


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--port", type=int, default=8000, help="preferred port (default 8000)")
    ap.add_argument("--no-open", action="store_true", help="don't open a browser")
    ap.add_argument("--quiet", action="store_true", help="log only errors")
    scene_group = ap.add_mutually_exclusive_group()
    scene_group.add_argument(
        "--lab",
        action="store_true",
        help="open the isolated single-mesh reconstruction lab",
    )
    scene_group.add_argument(
        "--replacement",
        action="store_true",
        help="open the reference-independent procedural replacement scene",
    )
    scene_group.add_argument(
        "--evaluation",
        action="store_true",
        help="open the fixed-view single-mesh Evaluation Harness",
    )
    scene_group.add_argument(
        "--runtime-audit",
        action="store_true",
        help="open the browser-side deterministic and performance audit",
    )
    scene_group.add_argument(
        "--stage-1-5",
        action="store_true",
        help="open Stage 1.5 replacements in the eight-slot Lab layout",
    )
    scene_group.add_argument(
        "--production-audit-root",
        type=Path,
        help="serve an isolated generated production package as the web root",
    )
    ap.add_argument(
        "--local-three",
        action="store_true",
        help="serve an installed three package instead of the CDN (works offline)",
    )
    args = ap.parse_args()

    serve_root = (
        args.production_audit_root.resolve()
        if args.production_audit_root
        else ROOT
    )
    if not (serve_root / "index.html").is_file():
        sys.exit(f"can't find {serve_root / 'index.html'}")
    if not (ROOT / "index.html").is_file():
        sys.exit(f"can't find {ROOT / 'index.html'} — run this script from its own directory")

    if args.replacement or args.evaluation or args.runtime_audit or args.stage_1_5:
        args.local_three = True

    port = pick_port(args.port)
    SceneHandler.quiet = args.quiet
    if args.local_three:
        SceneHandler.three_dir = find_three()
        if args.replacement or args.evaluation or args.runtime_audit or args.stage_1_5:
            version = three_version(SceneHandler.three_dir)
            if version != TARGET_THREE:
                sys.exit(
                    f"the selected procedural scene requires three {TARGET_THREE}, found {version} at "
                    f"{SceneHandler.three_dir}"
                )
    handler = partial(SceneHandler, directory=str(serve_root))
    if args.lab:
        url_path = "/single-mesh-lab/"
        scene_name = "Single Mesh Lab"
    elif args.replacement:
        url_path = "/single-mesh-replacement/"
        scene_name = "Single Mesh Procedural Replacement"
    elif args.evaluation:
        url_path = "/single-mesh-evaluation/"
        scene_name = "Single Mesh Evaluation Harness"
    elif args.runtime_audit:
        url_path = "/single-mesh-runtime-audit/"
        scene_name = "Single Mesh Runtime Audit"
    elif args.stage_1_5:
        url_path = "/stage-1-5-scene/"
        scene_name = "Stage 1.5 Reference-layout Scene"
    elif args.production_audit_root:
        url_path = "/"
        scene_name = "Isolated Production Audit Package"
    else:
        url_path = "/"
        scene_name = "Painterly Island"
    url = f"http://localhost:{port}{url_path}"

    with Server(("127.0.0.1", port), handler) as httpd:
        print(f"\n  {scene_name}  →  {url}")
        print(f"  serving {serve_root}")
        if SceneHandler.three_dir:
            version = three_version(SceneHandler.three_dir)
            print(f"  three: {SceneHandler.three_dir} (v{version})")
            if version != TARGET_THREE:
                print(
                    f"  ! this scene was written against three {TARGET_THREE}; v{version}"
                    f" may behave differently"
                )
        elif not args.production_audit_root:
            check_cdn()
        if args.replacement:
            controls_help = "static deterministic fixture"
        elif args.stage_1_5:
            controls_help = "orbit · zoom · pan · focus controls"
        elif args.evaluation or args.runtime_audit or args.production_audit_root:
            controls_help = "fixed protocol controls"
        else:
            controls_help = "WASD move · mouse look · Q/E up-down · Esc release"
        print(f"  {controls_help}\n  ctrl-c to stop\n", flush=True)

        if not args.no_open:
            threading.Timer(0.4, lambda: webbrowser.open(url)).start()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n  stopped")


if __name__ == "__main__":
    main()
