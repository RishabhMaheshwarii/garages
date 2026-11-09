export const EARTH_RADIUS_KM = 6371;

const toRad = (deg) => (deg * Math.PI) / 180;
const toDeg = (rad) => (rad * 180) / Math.PI;

export function isValidLat(v) {
  return Number.isFinite(v) && v >= -90 && v <= 90;
}

export function isValidLng(v) {
  return Number.isFinite(v) && v >= -180 && v <= 180;
}

/** Great-circle distance in km between two WGS84 points. */
export function haversineKm(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Bounding box that fully contains the circle (lat, lng, radiusKm).
 * Used as an index-friendly prefilter before the exact haversine check.
 *
 * Returns { minLat, maxLat, lngRanges } where lngRanges is 1 range normally,
 * 2 ranges when the box crosses the antimeridian, or the full [-180, 180]
 * when the circle reaches a pole.
 */
export function boundingBox(lat, lng, radiusKm) {
  const angular = radiusKm / EARTH_RADIUS_KM;
  let minLat = lat - toDeg(angular);
  let maxLat = lat + toDeg(angular);

  if (minLat <= -90 || maxLat >= 90) {
    return {
      minLat: Math.max(minLat, -90),
      maxLat: Math.min(maxLat, 90),
      lngRanges: [[-180, 180]],
    };
  }

  const dLng = toDeg(Math.asin(Math.sin(angular) / Math.cos(toRad(lat))));
  const minLng = lng - dLng;
  const maxLng = lng + dLng;

  let lngRanges;
  if (minLng < -180) {
    lngRanges = [[minLng + 360, 180], [-180, maxLng]];
  } else if (maxLng > 180) {
    lngRanges = [[minLng, 180], [-180, maxLng - 360]];
  } else {
    lngRanges = [[minLng, maxLng]];
  }

  return { minLat, maxLat, lngRanges };
}
