/**
 * The ridership derivation's entire public surface.
 *
 * Everything else in this folder is implementation: importing `../ridership/chartData`
 * from outside is visibly reaching past the seam. See
 * `docs/adr/0003-one-domain-folder-not-a-repo-wide-reorganisation.md`.
 */
export {
  buildRidershipView,
  type RidershipView,
  type RidershipViewInput,
  type LineSelection,
} from './buildRidershipView';
