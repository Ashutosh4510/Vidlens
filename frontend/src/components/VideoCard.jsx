import React, { useState } from 'react';
import { ExternalLink, Play, User, Bookmark, Check } from 'lucide-react';

export default function VideoCard({ video, isShortlisted, onToggleShortlist }) {
  const [imgError, setImgError] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const score = Math.round(video.match_score || video.matchScore || 0);
  const isBelowThreshold = Boolean(video.is_below_threshold || video.isBelowThreshold || score < 40);
  const platform = video.platform || 'instagram';
  const url = video.video_url || video.videoUrl || '#';
  const caption = video.caption || 'No caption available';
  const author = video.author || 'Unknown Creator';
  const reason = video.match_reason || video.matchReason || 'Scored against product visual attributes';
  const thumbnail = video.thumbnail_url || video.thumbnailUrl;

  const getScoreBadgeClass = () => {
    if (score >= 70) return 'score-badge--high';
    if (score >= 40) return 'score-badge--medium';
    return 'score-badge--low';
  };

  const getPlatformClass = () => {
    if (platform === 'instagram') return 'platform-badge--instagram';
    if (platform === 'meta') return 'platform-badge--meta';
    return 'platform-badge--tiktok';
  };

  const getPlatformLabel = () => {
    if (platform === 'instagram') return 'Instagram Reel';
    if (platform === 'meta') return 'Meta Ad Library';
    return 'TikTok';
  };

  return (
    <article className={`video-card fade-in ${isBelowThreshold ? 'video-card--low-match' : ''}`}>
      <div className="video-card__thumbnail-wrapper">
        {!imgError && thumbnail ? (
          <img
            src={thumbnail}
            alt={caption.slice(0, 50)}
            className="video-card__thumbnail"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="placeholder-img">
            <Play size={32} opacity={0.3} />
          </div>
        )}

        <div className="video-card__badge">
          <span className={`platform-badge ${getPlatformClass()}`}>
            {getPlatformLabel()}
          </span>
          {isBelowThreshold && (
            <span
              className="platform-badge"
              style={{ background: 'rgba(239, 68, 68, 0.8)', color: 'white' }}
              title="Below similarity confidence threshold (<40%)"
            >
              Low Match
            </span>
          )}
        </div>

        <div className={`score-badge ${getScoreBadgeClass()}`} title={`Match Score: ${score}%`}>
          {score}%
        </div>

        <div className="video-card__overlay">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="video-card__play-btn"
            title="Open original video source"
          >
            <ExternalLink size={20} />
          </a>
        </div>
      </div>

      <div className="video-card__body">
        <p className="video-card__caption" title={caption}>
          {caption}
        </p>

        <div className="video-card__meta">
          <span className="video-card__author">
            <User size={13} color="var(--text-muted)" />
            <span>{author}</span>
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {onToggleShortlist && (
              <button
                type="button"
                className="btn btn--ghost"
                style={{
                  padding: '4px 8px',
                  fontSize: '0.72rem',
                  color: isShortlisted ? 'var(--accent-secondary)' : 'var(--text-muted)',
                  borderColor: isShortlisted ? 'var(--accent-primary)' : undefined,
                  background: isShortlisted ? 'rgba(124,58,237,0.15)' : undefined,
                }}
                onClick={() => onToggleShortlist(video)}
                title={isShortlisted ? 'Remove from shortlist' : 'Add to shortlist'}
              >
                <Bookmark size={12} fill={isShortlisted ? 'currentColor' : 'none'} />
                <span>{isShortlisted ? 'Saved' : 'Save'}</span>
              </button>
            )}
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--accent-secondary)', fontSize: '0.75rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px' }}
            >
              <span>View</span>
              <ExternalLink size={11} />
            </a>
          </div>
        </div>

        {reason && (
          <div className="video-card__match-reason">
            <strong style={{ color: 'var(--text-secondary)' }}>AI Reason: </strong>
            <span>{reason}</span>
          </div>
        )}
      </div>
    </article>
  );
}
