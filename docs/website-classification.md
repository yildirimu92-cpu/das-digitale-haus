# Website classification

The website analysis uses one server-side classifier for the full industry catalog sent by the frontend. The frontend no longer maintains a separate list of branch-specific regexes.

## Netlify environment variables

Configure these in **Netlify → Site configuration → Environment variables**:

- `OPENAI_API_KEY`: API key for the server-side industry classification. Keep this secret; never expose it through `config.js`, frontend JavaScript, or a `VITE_*` variable.
- `OPENAI_CLASSIFIER_MODEL` (optional): model name; defaults to `gpt-4o-mini`.

After changing environment variables, trigger a new deploy.

If `OPENAI_API_KEY` is missing or the API request fails, the function uses a deterministic catalog-based fallback. That fallback is useful for obvious matches but is not equivalent to semantic AI classification. Do not claim complete coverage until the key is configured and the website test set passes.

## Tests

Run locally with Node.js 20:

```sh
node --test tests/website-classifier.test.js
```

The tests cover representative websites across the catalog and ensure that the classifier only returns IDs from the supplied catalog. Add a fixture whenever a regression is found; prefer representative cross-industry tests over one-off production rules.

## Logo policy

Only explicitly labeled logo assets from the customer's own domain are accepted. Social previews, favicons, and third-party assets are excluded. If no asset can be verified, no logo is shown. A human verification step is still recommended before presenting a logo as official.
