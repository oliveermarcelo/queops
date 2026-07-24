/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Minimal path-based router (no extra deps): /admin renders the admin panel,
 * everything else renders the storefront.
 */

import React from 'react';
import App from './App';
import AdminApp from './admin/AdminApp';

export default function Root() {
  const path = typeof window !== 'undefined' ? window.location.pathname : '/';
  if (path.startsWith('/admin')) {
    return <AdminApp />;
  }
  return <App />;
}
