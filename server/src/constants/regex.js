export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

/*
 * A comma-separated list of ObjectIds, used by query filters that accept more
 * than one id (e.g. `?labels=id,id`). Validating the whole list in one pattern
 * keeps the filter to plain string values — nothing can arrive as an object.
 */
export const OBJECT_ID_LIST_REGEX = /^[0-9a-fA-F]{24}(,[0-9a-fA-F]{24})*$/;

export const HEX_COLOR_REGEX = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
