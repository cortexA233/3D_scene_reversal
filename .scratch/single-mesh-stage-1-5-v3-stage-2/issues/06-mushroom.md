# 06 — Mushroom Procedural Replacement

Type: task
Status: resolved
Blocked by: 05

Implement five Repeated Organic Forms from one shared stem/cap generator and
pass the frozen Mushroom visual, nonvisual, determinism, independence, and
three-browser gates before continuing.

## Answer

Implemented five Repeated Organic Forms from one shared Catmull–Rom stem and
bell-cap generator in two render batches. The 88-scalar candidate passes all
nonvisual budgets and is frozen at `a91fc67`. Its category-v1 geometry FAIL is
retained at mean/worst IoU `0.83110/0.77453`.

Per the later user-authorized relaxation, ADR-0036 records an explicitly
candidate-informed compact geometry v2 rather than rewriting v1. The unchanged
v1 bounds limits plus the versioned silhouette/depth limits still reject every
pre-existing Stage 2 destructive geometry control. Measured cap/stem semantic
roles pass and cap deletion, stem deletion, and wrong-palette variants reject.
Chrome, Firefox, and Safari full gates pass, with two stable native hardware-GPU
runs in each non-Chrome browser.
