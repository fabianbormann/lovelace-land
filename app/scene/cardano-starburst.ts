/**
 * The official Cardano "starburst" mark, taken dot by dot from
 * https://cardano.org/img/brand-assets/cardano-starburst-blue.svg (copy in app/assets/brand/).
 * Each dot is a circle in SVG coordinates (y down). Brand rules from https://cardano.org/brand-assets/:
 * only brand colors (blue #0033AD, white, black), never stretch, rotate or distort, keep clear space
 * of six dots around it, at least 64 px wide on the web.
 */
export const CARDANO_STARBURST = {
  width: 375,
  height: 346.51,
  dots: [
    { x: 127.982, y: 173.39, r: 25.26 },
    { x: 8.163, y: 173.647, r: 8.16 },
    { x: 97.457, y: 18.155, r: 8.16 },
    { x: 121.103, y: 58.838, r: 12.61 },
    { x: 46.274, y: 92.129, r: 10.39 },
    { x: 55.21, y: 173.599, r: 12.62 },
    { x: 46.673, y: 254.996, r: 10.393 },
    { x: 99.136, y: 122.48, r: 14.842 },
    { x: 253.392, y: 58.549, r: 12.622 },
    { x: 276.819, y: 17.742, r: 8.16 },
    { x: 247.029, y: 173.1, r: 25.25 },
    { x: 157.631, y: 121.747, r: 25.254 },
    { x: 328.287, y: 91.529, r: 10.39 },
    { x: 275.683, y: 122.083, r: 14.84 },
    { x: 187.131, y: 10.386, r: 10.39 },
    { x: 187.246, y: 71.312, r: 14.84 },
    { x: 99.325, y: 224.424, r: 14.84 },
    { x: 217.103, y: 121.6, r: 25.22 },
    { x: 217.384, y: 224.729, r: 25.286 },
    { x: 275.862, y: 224.03, r: 14.84 },
    { x: 319.781, y: 172.96, r: 12.62 },
    { x: 366.843, y: 172.857, r: 8.16 },
    { x: 328.731, y: 254.374, r: 10.39 },
    { x: 98.168, y: 328.76, r: 8.16 },
    { x: 277.533, y: 328.352, r: 8.16 },
    { x: 157.881, y: 224.87, r: 25.25 },
    { x: 121.606, y: 287.961, r: 12.62 },
    { x: 186.789, y: 336.113, r: 10.39 },
    { x: 186.674, y: 275.188, r: 14.84 },
    { x: 253.93, y: 287.649, r: 12.62 },
  ],
} as const;

export const CARDANO_BLUE = '#0033ad';
export const CARDANO_WHITE = '#ffffff';
