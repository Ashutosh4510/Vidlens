import React from 'react';
import VideoCard from './VideoCard';
import { AlertTriangle, VideoOff, RefreshCw } from 'lucide-react';

export default function ResultsGrid({ videos, isLoading, platform, counts, shortlist = [], onToggleShortlist }) {
  if (isLoading && (!videos || videos.length === 0)) {
    return (
      <div className="results-grid">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="video-card skeleton" style={{ height: '320px' }} />
        ))}
      </div>
    );
  }

  if (!videos || videos.length === 0) {
    return (
      <div className="empty-state fade-in">
        <VideoOff className="empty-state__icon" size={48} />
        <h3 className="empty-state__title">No videos found</h3>
        <p className="empty-state__text">
          No matching videos discovered for this product category and platform yet. Try broadening your keyword or searching with a different product link.
        </p>
      </div>
    );
  }

  const igCount = counts.instagram || 0;
  const metaCount = counts.meta || 0;
  const showIgShortfall = (platform === 'all' || platform === 'instagram') && igCount < 20 && igCount > 0;
  const showMetaShortfall = (platform === 'all' || platform === 'meta') && metaCount < 20 && metaCount > 0;

  const shortlistedIds = new Set(shortlist.map((v) => v.id || v.videoUrl || v.video_url));

  return (
    <div>
      {(showIgShortfall || showMetaShortfall) && (
        <div className="shortfall-banner fade-in">
          <AlertTriangle size={16} />
          <div>
            <strong>Notice on 20-video target: </strong>
            {showIgShortfall && `Instagram returned ${igCount}/20. `}
            {showMetaShortfall && `Meta Ad Library returned ${metaCount}/20. `}
            Deep query broadening triggered to gather as many unique items as possible.
          </div>
        </div>
      )}

      <div className="results-grid">
        {videos.map((vid) => {
          const vidId = vid.id || vid.videoUrl || vid.video_url;
          return (
            <VideoCard
              key={vidId}
              video={vid}
              isShortlisted={shortlistedIds.has(vidId)}
              onToggleShortlist={onToggleShortlist}
            />
          );
        })}
      </div>
    </div>
  );
}
