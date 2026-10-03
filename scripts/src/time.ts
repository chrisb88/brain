function pad(value: number): string {
    return String(value).padStart(2, '0');
}

export function formatDate(date: Date): string {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatStamp(date: Date): string {
    return `${formatDate(date)}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

export function formatLogTime(date: Date): string {
    return `${formatDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatIsoUtc(date: Date): string {
    return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}
