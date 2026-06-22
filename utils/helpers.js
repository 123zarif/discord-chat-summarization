export function parseTimeToMilliseconds(timeStr) {
    const match = timeStr.toLowerCase().match(/^(\d+)([mhd])$/);
    if (!match) return null;

    const value = parseInt(match[1], 10);
    const unit = match[2];

    const unitMultipliers = {
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000
    };

    return value * unitMultipliers[unit];
}