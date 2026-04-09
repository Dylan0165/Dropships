# Social Proof / Reviews

Customer review cards with star ratings, avatars, and verified badges.
Grid layout with optional summary statistics header.

## Props
- `reviews`: Review[] — Customer reviews
- `showSummary?`: boolean — Show average rating header (default: true)

## Review Shape
- `id`: string
- `name`: string
- `avatar?`: string
- `rating`: 1-5
- `text`: string
- `date`: string
- `verified?`: boolean
