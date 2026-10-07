import React from 'react';
import { Brain, Tag, Palette, ShieldCheck, Sparkles, Hash } from 'lucide-react';

export default function ProductPanel({ search }) {
  if (!search || (!search.product_title && !search.query)) return null;

  const title = search.product_title || search.query;
  const description = search.product_description;
  const imageUrl = search.product_image_url;
  const attributes = search.product_attributes || {};

  const colors = attributes.colors || [];
  const patterns = attributes.patterns || [];
  const keyFeatures = attributes.keyFeatures || [];
  const brand = attributes.brand;
  const productType = attributes.productType;
  const material = attributes.material;
  const shape = attributes.shape;

  return (
    <div className="product-panel fade-in">
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={title}
          className="product-panel__image"
          onError={(e) => {
            e.target.style.display = 'none';
          }}
        />
      ) : (
        <div className="product-panel__image placeholder-img">
          <Brain size={36} style={{ color: 'var(--accent-secondary)' }} />
        </div>
      )}

      <div className="product-panel__info">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <span className="attribute-tag" style={{ background: 'rgba(124, 58, 237, 0.2)', color: 'var(--text-accent)' }}>
            <Brain size={12} />
            AI Image Brain Analysis
          </span>
          {search.input_type === 'url' && (
            <span className="attribute-tag">Scraped from Web URL</span>
          )}
        </div>

        <h2 className="product-panel__title">{title}</h2>

        {description && (
          <p className="product-panel__description" title={description}>
            {description}
          </p>
        )}

        <div className="product-panel__attributes">
          {productType && (
            <span className="attribute-tag">
              <Tag size={12} /> Category: <strong>{productType}</strong>
            </span>
          )}

          {brand && (
            <span className="attribute-tag">
              <ShieldCheck size={12} /> Brand: <strong>{brand}</strong>
            </span>
          )}

          {colors.map((c, i) => (
            <span key={i} className="attribute-tag attribute-tag--color">
              <Palette size={12} /> {c}
            </span>
          ))}

          {material && (
            <span className="attribute-tag">
              Material: <strong>{material}</strong>
            </span>
          )}

          {shape && (
            <span className="attribute-tag">
              Shape: <strong>{shape}</strong>
            </span>
          )}

          {patterns.map((p, i) => (
            <span key={`p-${i}`} className="attribute-tag">
              Pattern: <strong>{p}</strong>
            </span>
          ))}

          {keyFeatures.map((f, i) => (
            <span key={`f-${i}`} className="attribute-tag" style={{ borderStyle: 'dashed' }}>
              <Sparkles size={11} /> {f}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
