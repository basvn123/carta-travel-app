import React from 'react';
import { SCREEN_SIZE } from '../../lib/homeDemo.js';

/**
 * The two devices the home page shows the app in (T463): a phone and a
 * laptop browser window, each holding a real capture of the running app
 * (public/home/<lang>/, scripts/shoot_home_screens.mjs).
 *
 * Both stand straight: no tilt, no fan, nothing laid over the screen, the
 * phone's bar at 9:41 with full signal (the convention for showing an app as
 * it runs). Each is one object with one shadow (--elev-3) and no border.
 * The capture carries the meaning, so each <img> has a real alt.
 *
 *   PhoneFrame    src, alt, eager, className, children (more screens, for a
 *                 frame that changes screen: they stack in the same box)
 *   BrowserFrame  src, alt, eager, className
 */

function StatusIcons() {
  return (
    <svg className="home-phone-icons" viewBox="0 0 54 12" aria-hidden="true">
      <rect x="0" y="7" width="3" height="5" rx="1" />
      <rect x="4.5" y="5" width="3" height="7" rx="1" />
      <rect x="9" y="2.5" width="3" height="9.5" rx="1" />
      <rect x="13.5" y="0" width="3" height="12" rx="1" />
      <path d="M27 3.2a9.6 9.6 0 0 1 6.8 2.8l1.2-1.2a11.3 11.3 0 0 0-16 0l1.2 1.2A9.6 9.6 0 0 1 27 3.2Zm0 3.3a6.3 6.3 0 0 1 4.4 1.8l1.2-1.2a8 8 0 0 0-11.2 0l1.2 1.2A6.3 6.3 0 0 1 27 6.5Zm0 3.3a3 3 0 0 1 2.1.9L27 12.8l-2.1-2.1a3 3 0 0 1 2.1-.9Z" />
      <rect className="home-phone-cell" x="38.5" y="1" width="13" height="10" rx="3" fill="none" />
      <rect x="40.5" y="3" width="9" height="6" rx="1.5" />
      <rect x="52.5" y="4.2" width="1.5" height="3.6" rx="0.75" />
    </svg>
  );
}

export function PhoneScreen({ src, alt, eager = false, className = '', hidden = false }) {
  const [w, h] = SCREEN_SIZE.phone;
  return (
    <img
      className={`home-phone-img ${className}`.trim()}
      src={src}
      alt={alt}
      aria-hidden={hidden || undefined}
      width={w}
      height={h}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      fetchpriority={eager ? 'high' : undefined}
    />
  );
}

export function PhoneFrame({ src, alt, eager = false, className = '', children = null }) {
  return (
    <div className={`home-phone ${className}`.trim()}>
      <div className="home-phone-glass">
        <div className="home-phone-bar" aria-hidden="true">
          <span className="home-phone-time">9:41</span>
          <span className="home-phone-island" />
          <StatusIcons />
        </div>
        <div className="home-phone-view">
          {children || <PhoneScreen src={src} alt={alt} eager={eager} />}
        </div>
      </div>
    </div>
  );
}

export function BrowserFrame({ src, alt, eager = false, className = '' }) {
  const [w, h] = SCREEN_SIZE.desk;
  return (
    <div className={`home-browser ${className}`.trim()}>
      <div className="home-browser-bar" aria-hidden="true">
        <span className="home-browser-dots"><i /><i /><i /></span>
        <span className="home-browser-url">carta-europetravel.com</span>
      </div>
      <img
        className="home-browser-img"
        src={src}
        alt={alt}
        width={w}
        height={h}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        fetchpriority={eager ? 'high' : undefined}
      />
    </div>
  );
}
