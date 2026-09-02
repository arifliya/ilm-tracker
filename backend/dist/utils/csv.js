"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toCsv = exports.escapeCsvField = void 0;
const escapeCsvField = (value) => {
    const str = value === null || value === undefined ? "" : String(value);
    if (/[",\n]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
};
exports.escapeCsvField = escapeCsvField;
const toCsv = (headers, rows) => {
    const lines = [headers.map(exports.escapeCsvField).join(",")];
    for (const row of rows) {
        lines.push(row.map(exports.escapeCsvField).join(","));
    }
    return lines.join("\r\n");
};
exports.toCsv = toCsv;
