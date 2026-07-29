# Single Mesh Procedural Replacement

This page is the Reference-Independent production-style entrypoint for the
Single Mesh Reconstruction experiment. It uses a synthetic acceptance fixture
to prove the Object Generator, deterministic RNG, semantic-root, local Three.js,
and offline browser boundaries before any authored object generator exists.

The fixture is test infrastructure, not an island object and not a general
modeling abstraction.

Run the page locally:

```sh
./run.sh --replacement
```

Run the complete non-interactive Ticket 01 acceptance:

```sh
npm run accept:ticket-01
```

The replacement page imports no Authored Reference, GLTF/Draco loader, texture
loader, model CDN, or Single Mesh Lab presentation state.
