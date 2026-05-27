# Phase 4 Local API Runtime Patch

The admin panel now requests product counts with:

```text
/api/products?limit=...&page=...&stats=1
```

The runtime Local API at `/Users/m4-ai/.openclaw/shop/local-api.js` must include the `stats` envelope in `GET /api/products`; otherwise the admin UI can still list products, but the top count cards fall back to loaded-page counts.

Patch location in `local-api.js`: inside `app.get('/api/products', ...)`, after all filters and before sorting/pagination:

```js
  var stats = null;
  if (req.query.stats === '1' || req.query.stats === 'true') {
    stats = { total: products.length, inStock: 0, outOfStock: 0, lowStock: 0, categories: {}, channelStatus: {} };
    products.forEach(function(p) {
      var stock = parseInt(p.stock) || 0;
      var cat = p.category || 'other';
      stats.categories[cat] = (stats.categories[cat] || 0) + 1;
      if (stock > 0) stats.inStock += 1;
      else stats.outOfStock += 1;
      if (stock > 0 && stock <= 5) stats.lowStock += 1;
      var cs = computeChannelStatus(p);
      if (cs.complete) stats.channelStatus.complete = (stats.channelStatus.complete || 0) + 1;
      if (!cs.complete) stats.channelStatus.incomplete = (stats.channelStatus.incomplete || 0) + 1;
      if (cs.connectedCount === 0) stats.channelStatus.no_channel = (stats.channelStatus.no_channel || 0) + 1;
    });
  }
```

And replace the product response with:

```js
  var response = {
    products: paginated,
    total: products.length,
    page: page,
    pages: Math.ceil(products.length / limit)
  };
  if (stats) response.stats = stats;
  res.json(response);
```

Verification:

```sh
curl -4 -sS 'http://localhost:3001/api/products?limit=1&stats=1'
```

Expected top-level fields include `products`, `total`, `page`, `pages`, and `stats`.
