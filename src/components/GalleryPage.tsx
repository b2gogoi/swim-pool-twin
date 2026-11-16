import React, { useEffect, useState } from 'react';
import { Images, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { db, EventPhoto } from '../db/poolDatabase';

interface GalleryItem extends EventPhoto {
  previewUrl: string | null;
  eventName: string;
}

export const GalleryPage: React.FC = () => {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    let previewUrls: string[] = [];

    const loadGallery = async () => {
      setIsLoading(true);
      try {
        const photos = await db.photos.toArray();
        photos.sort((left, right) => right.createdAt - left.createdAt);
        const [blobs, events] = await Promise.all([
          db.photoBlobs.bulkGet(photos.map((photo) => photo.id)),
          db.events.bulkGet([...new Set(photos.map((photo) => photo.eventId))]),
        ]);

        if (!isCurrent) return;

        const eventNames = new Map<string, string>();
        events.forEach((event) => {
          if (event) eventNames.set(event.id, event.name);
        });
        const galleryItems = photos.map((photo, index) => {
          const blob = blobs[index]?.blob;
          const previewUrl = blob ? URL.createObjectURL(blob) : null;
          if (previewUrl) previewUrls.push(previewUrl);
          return {
            ...photo,
            previewUrl,
            eventName: eventNames.get(photo.eventId) || 'Uploaded photo',
          };
        });

        setItems(galleryItems);
        setSelectedId((currentId) =>
          currentId && photos.some((photo) => photo.id === currentId)
            ? currentId
            : photos[0]?.id ?? null
        );
      } catch (error) {
        console.error('Unable to load the photo gallery:', error);
        if (isCurrent) setLoadError(true);
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    };

    loadGallery();
    return () => {
      isCurrent = false;
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const selectedItem = items.find((item) => item.id === selectedId) ?? null;
  const missingBlobCount = items.filter((item) => !item.previewUrl).length;

  return (
    <main className="gallery-page" aria-label="Gallery">
      <div className="gallery-page-heading">
        <div className="gallery-icon"><Images size={20} /></div>
        <div className="gallery-title-group">
          <p className="eyebrow">WORKSPACE</p>
          <h1>Gallery</h1>
        </div>
        <span className="gallery-count">
          {isLoading ? 'Loading photos…' : `${items.length} ${items.length === 1 ? 'photo' : 'photos'}`}
        </span>
        {!isLoading && !loadError && items.length > 0 && (
          <button
            className="preview-toggle"
            onClick={() => setPreviewOpen((open) => !open)}
            aria-expanded={previewOpen}
            aria-controls={previewOpen ? 'gallery-preview' : undefined}
            title={previewOpen ? 'Collapse preview' : 'Expand preview'}
          >
            {previewOpen ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}
            <span>{previewOpen ? 'Hide preview' : 'Show preview'}</span>
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="gallery-status">Loading your uploaded photos…</div>
      ) : loadError ? (
        <div className="gallery-status">Could not load your photos. Reopen Gallery to try again.</div>
      ) : items.length === 0 ? (
        <div className="gallery-status gallery-empty-state">
          <div className="empty-state-icon"><Images size={25} /></div>
          <h2>Your gallery is empty</h2>
          <p>Photos uploaded from the Dashboard will appear here.</p>
        </div>
      ) : (
        <>
        {missingBlobCount > 0 && (
          <div className="gallery-storage-warning" role="status">
            {missingBlobCount} photo {missingBlobCount === 1 ? 'record has' : 'records have'} no local image Blob. Check <strong>DB → photoBlobs</strong>; IndexedDB is separate for each site and browser profile.
          </div>
        )}
        <div className={`gallery-browser${previewOpen ? '' : ' preview-collapsed'}`}>
          <section className="gallery-grid" aria-label="Uploaded photos">
            {items.map((item) => (
              <button
                className={`gallery-card${selectedId === item.id ? ' selected' : ''}`}
                key={item.id}
                onClick={() => {
                  setSelectedId(item.id);
                  setPreviewOpen(true);
                }}
                aria-pressed={selectedId === item.id}
              >
                <span className="gallery-thumbnail">
                  {item.previewUrl ? (
                    <img src={item.previewUrl} alt="" loading="lazy" />
                  ) : (
                    <span className="thumbnail-missing"><Images size={22} />Preview unavailable</span>
                  )}
                  {item.solvedCamera && <span className="mapped-badge">Mapped</span>}
                </span>
                <span className="gallery-card-details">
                  <span className="gallery-file-name" title={item.filename}>{item.filename}</span>
                  <span className="gallery-file-meta">{item.eventName} · {item.width} × {item.height}</span>
                </span>
              </button>
            ))}
          </section>

          {previewOpen && (
            <aside className="gallery-preview" id="gallery-preview" aria-label="Photo preview">
              <div className="preview-heading">
                <div>
                  <p className="eyebrow">PREVIEW</p>
                  <h2>{selectedItem?.filename ?? 'Select a photo'}</h2>
                </div>
                <button
                  className="preview-icon-button"
                  onClick={() => setPreviewOpen(false)}
                  aria-label="Collapse preview"
                  title="Collapse preview"
                >
                  <PanelRightClose size={17} />
                </button>
              </div>
              {selectedItem?.previewUrl ? (
                <div className="preview-image-wrap">
                  <img src={selectedItem.previewUrl} alt={selectedItem.filename} />
                </div>
              ) : (
                <div className="preview-image-wrap preview-placeholder">
                  <Images size={28} />
                  <span>{selectedItem ? 'Image data is not available on this device' : 'Choose a photo from the grid'}</span>
                </div>
              )}
              {selectedItem && (
                <div className="preview-details">
                  <div className="preview-detail-row"><span>Event</span><strong>{selectedItem.eventName}</strong></div>
                  <div className="preview-detail-row"><span>Dimensions</span><strong>{selectedItem.width} × {selectedItem.height}</strong></div>
                  <div className="preview-detail-row"><span>Added</span><strong>{new Date(selectedItem.createdAt).toLocaleDateString()}</strong></div>
                  <div className="preview-detail-row"><span>Mapping</span><strong>{selectedItem.solvedCamera ? 'Mapped to pool' : 'Not mapped'}</strong></div>
                </div>
              )}
            </aside>
          )}
        </div>
        </>
      )}
    </main>
  );
};
