# The dim sum surprise

## Behaviour

A 10% chance at startup of a dish: its name in English and Traditional Chinese,
its jyutping, and a photograph. It appears in a screen corner, auto-dismisses
after nine seconds, never takes focus, and never gates startup. It fires at most
once per launch, and only after the interface is already usable.

There is no setting to switch it off. That is the contract, and it is exactly
why the surface has to stay this polite.

## Configuration

None, deliberately.

## A documented deviation

The surprise contract says the images are **bundled local assets with no network
fetch**. The dim-sum sourcing rule says the opposite for a consuming project:
photos come only from the public `Ding-Ding-Projects/dim-sum-photos` catalog or
an application-data cache, and are **never** committed into a consuming
repository.

The sourcing rule wins here, because it is the narrower rule and because
vendoring 2,866 photographs into this repository would be absurd. The
consequence is stated rather than hidden:

> **A machine that has never been online never sees the surprise.**

That is acceptable degradation for a purely decorative, non-blocking feature. It
is not acceptable to pretend otherwise, which is why it is written here rather
than left for somebody to discover.

## Failure modes

Every one of these results in *nothing being shown*, which is the correct
outcome for decoration:

- The 10% draw did not fire.
- There is no cached catalog and the fetch failed, timed out, or was blocked.
- The catalog returned no usable dishes.
- The photograph itself fails to load — the name is still shown, the image is
  simply omitted rather than left as a broken frame.

## Security considerations

The catalog fetch is a single request to a public raw URL with an eight-second
timeout, and only the fields the surprise renders are cached. The cache records
its source URL and fetch time beside the data so it is never mistaken for a
second authority on the catalog.

Photographs are loaded from the published `catalog-v1*` release assets. **Not**
from the repository tree: the catalog's own `image.path` is a repository-relative
path that returns 404, and the assets live on the releases. Guessing a URL from
the dish slug produced a 404 for every dish, which is why the filename is read
from the catalog's `image.path` rather than constructed.

## Verification

`app/test/unit/dim-sum-test.mjs` asserts the draw boundaries exactly (0.0999
fires, 0.1 does not), that the URL is built from the catalog filename rather
than the slug, that it points at a release asset rather than the repository
tree, and that a candidate exists for each of the three photo releases.

The rendered surface has **not** been captured yet: it fires one launch in ten,
so a capture is probabilistic and none has been taken. Its `realCapture` row
says so.
