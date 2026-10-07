import React, { useState } from 'react';
import { Search, Link as LinkIcon, Sparkles, ArrowRight } from 'lucide-react';

export default function SearchBar({ onSearch, isLoading, compact = false }) {
  const [inputVal, setInputVal] = useState('');

  const sampleQueries = [
    { label: 'Oversized Graphic Tee', query: 'oversized graphic tee' },
    { label: 'Protein Dark Chocolate', query: 'protein dark chocolate' },
    { label: 'Minimalist Leather Backpack', query: 'minimalist leather backpack' },
    { label: 'Wireless Noise Canceling Headphones', query: 'wireless noise canceling headphones' },
    { label: 'Shopify / Brand URL', query: 'https://gymshark.com/products/crest-hoodie-black' },
  ];

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!inputVal.trim() || isLoading) return;
    onSearch(inputVal.trim());
  };

  const handleSelectSample = (query) => {
    setInputVal(query);
    onSearch(query);
  };

  const isUrl = /^https?:\/\//i.test(inputVal.trim());

  return (
    <section className={`search-section ${compact ? 'search-section--compact' : ''}`}>
      <form onSubmit={handleSubmit} className="search-bar">
        <div className="search-bar__input-wrapper">
          <div className="search-bar__icon">
            {isUrl ? <LinkIcon size={20} className="text-accent" /> : <Search size={20} />}
          </div>
          <input
            type="text"
            className="search-bar__input"
            placeholder="Type a product name (e.g. 'oversized graphic tee') or paste a product URL..."
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            disabled={isLoading}
          />
          <button
            type="submit"
            className="search-bar__btn"
            disabled={!inputVal.trim() || isLoading}
          >
            {isLoading ? (
              <>
                <span className="spinner" />
                <span>Searching...</span>
              </>
            ) : (
              <>
                <span>Discover</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </div>

        {!compact && (
          <div className="search-bar__hint" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-secondary)' }}>
              <Sparkles size={14} style={{ color: 'var(--accent-secondary)' }} />
              Quick Try:
            </span>
            {sampleQueries.map((item, idx) => (
              <button
                key={idx}
                type="button"
                className="btn btn--ghost"
                style={{ padding: '4px 10px', fontSize: '0.75rem', borderRadius: 'var(--radius-full)' }}
                onClick={() => handleSelectSample(item.query)}
                disabled={isLoading}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </form>
    </section>
  );
}
