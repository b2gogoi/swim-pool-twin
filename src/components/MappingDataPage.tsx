import React, { useEffect, useMemo, useState } from 'react';
import { db, EventPhoto } from '../db/poolDatabase';
import { usePoolStore } from '../store/usePoolStore';
import { getPoolAnchors } from '../utils/poolLandmarks';

interface Props {
  photos: EventPhoto[];
}

/** Read-only view of the confirmed photo-to-pool correspondences used as mapping references. */
export const MappingDataPage: React.FC<Props> = ({ photos }) => {
  const { activePool } = usePoolStore();
  const [visualFeatureCount, setVisualFeatureCount] = useState(0);
  const [autoMapReviews, setAutoMapReviews] = useState<Array<{ status: 'pending' | 'accepted' | 'rejected' }>>([]);
  const anchors = getPoolAnchors(activePool);
  useEffect(() => {
    let current = true;
    Promise.all([
      db.mappingFeatures.where('poolId').equals(activePool.id).count(),
      db.autoMapReviews.where('poolId').equals(activePool.id).toArray(),
    ]).then(([count, reviews]) => {
      if (current) {
        setVisualFeatureCount(count);
        setAutoMapReviews(reviews.map((review) => ({ status: review.status })));
      }
    }).catch(() => {
      if (current) { setVisualFeatureCount(0); setAutoMapReviews([]); }
    });
    return () => { current = false; };
  }, [activePool.id, photos]);
  const graph = useMemo(() => {
    const observations = photos.flatMap((photo) => photo.mappings.map((mapping) => ({
      photoId: photo.id,
      filename: photo.filename,
      anchorId: mapping.anchorId,
      label: mapping.label,
      pixel: mapping.pixel,
      world: mapping.world,
    })));
    const byAnchor = new Map<string, typeof observations>();
    observations.forEach((item) => byAnchor.set(item.anchorId, [...(byAnchor.get(item.anchorId) || []), item]));
    return { observations, byAnchor };
  }, [photos]);

  const covered = graph.byAnchor.size;
  const coverage = anchors.length ? Math.round((covered / anchors.length) * 100) : 0;
  const mappedPhotos = photos.filter((photo) => photo.mappings.length > 0 || (photo.lineMappings || []).length > 0).length;
  const solvedPhotos = photos.filter((photo) => photo.solvedCamera).length;
  const meanError = photos.filter((photo) => photo.solvedCamera).length
    ? photos.filter((photo) => photo.solvedCamera).reduce((sum, photo) => sum + (photo.solvedCamera?.reprojectionError || 0), 0) / solvedPhotos
    : null;
  const acceptedReviews = autoMapReviews.filter((review) => review.status === 'accepted').length;
  const rejectedReviews = autoMapReviews.filter((review) => review.status === 'rejected').length;
  const pendingReviews = autoMapReviews.filter((review) => review.status === 'pending').length;
  const reviewedCount = acceptedReviews + rejectedReviews;
  const reviewAcceptance = reviewedCount ? `${Math.round((acceptedReviews / reviewedCount) * 100)}%` : '—';

  return (
    <main className="mapping-data-page">
      <header className="mapping-data-header">
        <div>
          <div className="mapping-eyebrow">LOCAL REFERENCE GRAPH</div>
          <h1>Mapping data</h1>
          <p>Confirmed photo observations linked to canonical 3D pool landmarks.</p>
        </div>
        <div className="mapping-pool-chip">{activePool.name}</div>
      </header>

      <section className="mapping-metrics" aria-label="Mapping reference progress">
        <article className="mapping-metric mapping-progress-card">
          <div className="mapping-metric-label">Landmark reference coverage</div>
          <div className="mapping-progress-line"><strong>{coverage}%</strong><span>{covered} of {anchors.length} pool landmarks observed</span></div>
          <div className="mapping-progress-track"><i style={{ width: `${coverage}%` }} /></div>
          <small>Coverage shows how much of this pool has reference observations. It is not a prediction accuracy score.</small>
        </article>
        <Metric label="Photo references" value={mappedPhotos} detail={`${photos.length} photos in active event`} />
        <Metric label="Point observations" value={graph.observations.length} detail={`${graph.byAnchor.size} distinct landmarks`} />
        <Metric label="Local visual features" value={visualFeatureCount} detail="ORB descriptors from confirmed points" />
        <Metric label="Review acceptance" value={reviewAcceptance} detail={`${acceptedReviews} accepted · ${rejectedReviews} dismissed · ${pendingReviews} pending; review signal, not verified accuracy`} />
        <Metric label="Solved poses" value={solvedPhotos} detail={meanError === null ? 'No reprojection data yet' : `Mean reprojection error ${meanError.toFixed(1)} px`} />
      </section>

      <section className="mapping-graph-panel">
        <div className="mapping-section-heading">
          <div><h2>Photo ↔ landmark graph</h2><p>Each line connects a confirmed image point to its 3D pool landmark.</p></div>
          <span>{graph.observations.length} links</span>
        </div>
        {graph.observations.length === 0 ? (
          <div className="mapping-empty"><div className="mapping-empty-icon">◎</div><h3>No reference links yet</h3><p>Map landmarks on photos in Dashboard. Confirmed points will appear here automatically.</p></div>
        ) : (
          <div className="mapping-graph-scroll">
            <div className="mapping-graph-columns">
              <div className="mapping-graph-column">
                <h3>PHOTOS</h3>
                {photos.filter((p) => p.mappings.length).map((photo) => (
                  <div className="mapping-photo-node" key={photo.id}>
                    <span className="mapping-node-dot photo-dot" />
                    <span className="mapping-node-name" title={photo.filename}>{photo.filename}</span>
                    <span className="mapping-node-count">{photo.mappings.length}</span>
                  </div>
                ))}
              </div>
              <div className="mapping-link-column" aria-hidden="true">
                {graph.observations.map((observation, index) => <div key={`${observation.photoId}-${observation.anchorId}-${index}`} className="mapping-link-row"><i /></div>)}
              </div>
              <div className="mapping-graph-column landmark-column">
                <h3>3D LANDMARKS</h3>
                {Array.from(graph.byAnchor.entries()).map(([anchorId, items]) => (
                  <div className="mapping-landmark-node" key={anchorId}>
                    <span className="mapping-node-dot landmark-dot" />
                    <span className="mapping-node-name" title={items[0].label}>{items[0].label}</span>
                    <span className="mapping-node-count">{items.length}×</span>
                    <span className="mapping-world-coord">({items[0].world.x.toFixed(1)}, {items[0].world.y.toFixed(1)}, {items[0].world.z.toFixed(1)}) m</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="mapping-observations-panel">
        <div className="mapping-section-heading"><div><h2>Observations</h2><p>Image pixel coordinates paired with their pool-space position.</p></div></div>
        {graph.observations.length > 0 && <div className="mapping-table-wrap"><table className="mapping-table"><thead><tr><th>Photo</th><th>Landmark</th><th>Image (px)</th><th>Pool position (m)</th></tr></thead><tbody>
          {graph.observations.map((item, index) => <tr key={`${item.photoId}-${item.anchorId}-${index}`}><td title={item.filename}>{item.filename}</td><td>{item.label}</td><td className="mapping-mono">{item.pixel.u}, {item.pixel.v}</td><td className="mapping-mono">{item.world.x.toFixed(2)}, {item.world.y.toFixed(2)}, {item.world.z.toFixed(2)}</td></tr>)}
        </tbody></table></div>}
      </section>
    </main>
  );
};

const Metric: React.FC<{ label: string; value: number | string; detail: string }> = ({ label, value, detail }) => (
  <article className="mapping-metric"><div className="mapping-metric-label">{label}</div><strong className="mapping-metric-value">{value}</strong><small>{detail}</small></article>
);
