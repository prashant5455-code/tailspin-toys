import { and, asc, eq, inArray, or, type SQL } from 'drizzle-orm';
import type { Database } from './db';
import { games, categories, publishers } from '../../db/schema';
import type { Game } from '../types/game';

/** A single game filter value or a collection of values. */
export type GameFilterValue = string | number | Array<string | number> | null | undefined;

/** Filters that can be applied to game listings and ID lookups. */
export interface GameFilterOptions {
    categories?: GameFilterValue;
    categoryNames?: GameFilterValue;
    categoryIds?: GameFilterValue;
    publishers?: GameFilterValue;
    publisherNames?: GameFilterValue;
    publisherIds?: GameFilterValue;
}

const gameSelection = {
    id: games.id,
    title: games.title,
    description: games.description,
    starRating: games.starRating,
    categoryId: categories.id,
    categoryName: categories.name,
    publisherId: publishers.id,
    publisherName: publishers.name,
};

type GameSelectionRow = {
    id: number;
    title: string;
    description: string;
    starRating: number | null;
    categoryId: number | null;
    categoryName: string | null;
    publisherId: number | null;
    publisherName: string | null;
};

function mapGame(row: GameSelectionRow): Game {
    return {
        id: row.id,
        title: row.title,
        description: row.description,
        starRating: row.starRating,
        category:
            row.categoryId !== null && row.categoryName !== null
                ? { id: row.categoryId, name: row.categoryName }
                : null,
        publisher:
            row.publisherId !== null && row.publisherName !== null
                ? { id: row.publisherId, name: row.publisherName }
                : null,
    };
}

function baseGamesQuery(db: Database) {
    return db
        .select(gameSelection)
        .from(games)
        .leftJoin(categories, eq(games.categoryId, categories.id))
        .leftJoin(publishers, eq(games.publisherId, publishers.id));
}

/** Removes empty filter values and returns a consistent array representation. */
function normalizeFilterValues(value: GameFilterValue): Array<string | number> {
    if (value === null || value === undefined) {
        return [];
    }

    if (Array.isArray(value)) {
        return value.filter((entry) => entry !== null && entry !== undefined && String(entry).trim() !== '');
    }

    return [value].filter((entry) => entry !== null && entry !== undefined && String(entry).trim() !== '');
}

/** Converts name filters to trimmed, non-empty strings. */
function normalizeNameFilters(value: GameFilterValue): string[] {
    return normalizeFilterValues(value)
        .map((entry) => String(entry).trim())
        .filter((entry) => entry.length > 0);
}

/** Converts ID filters to finite numbers. */
function normalizeIdFilters(value: GameFilterValue): number[] {
    return normalizeFilterValues(value)
        .map((entry) => Number(entry))
        .filter((entry) => Number.isFinite(entry));
}

/** Builds a SQL condition for the selected categories and publishers. */
function getGameFilterCondition(filters: GameFilterOptions = {}): SQL | undefined {
    const categoryNames = normalizeNameFilters(filters.categories ?? filters.categoryNames);
    const categoryIds = normalizeIdFilters(filters.categoryIds);
    const publisherNames = normalizeNameFilters(filters.publishers ?? filters.publisherNames);
    const publisherIds = normalizeIdFilters(filters.publisherIds);

    const categoryClauses: SQL[] = [];
    if (categoryNames.length > 0) {
        categoryClauses.push(inArray(categories.name, categoryNames));
    }
    if (categoryIds.length > 0) {
        categoryClauses.push(inArray(categories.id, categoryIds));
    }

    const publisherClauses: SQL[] = [];
    if (publisherNames.length > 0) {
        publisherClauses.push(inArray(publishers.name, publisherNames));
    }
    if (publisherIds.length > 0) {
        publisherClauses.push(inArray(publishers.id, publisherIds));
    }

    const conditions: SQL[] = [];
    const categoryCondition = categoryClauses.length === 1 ? categoryClauses[0] : or(...categoryClauses);
    const publisherCondition = publisherClauses.length === 1 ? publisherClauses[0] : or(...publisherClauses);
    if (categoryCondition) {
        conditions.push(categoryCondition);
    }
    if (publisherCondition) {
        conditions.push(publisherCondition);
    }

    return and(...conditions);
}

/** All games ordered by title, optionally filtered by category and publisher. */
export async function getAllGames(db: Database, filters: GameFilterOptions = {}): Promise<Game[]> {
    const rows = await baseGamesQuery(db).where(getGameFilterCondition(filters)).orderBy(asc(games.title));
    return rows.map(mapGame);
}

/** All game ids ordered by title, optionally filtered by category and publisher. */
export async function getAllGameIds(db: Database, filters: GameFilterOptions = {}): Promise<number[]> {
    const rows = await db
        .select({ id: games.id })
        .from(games)
        .leftJoin(categories, eq(games.categoryId, categories.id))
        .leftJoin(publishers, eq(games.publisherId, publishers.id))
        .where(getGameFilterCondition(filters))
        .orderBy(asc(games.title));
    return rows.map((row) => row.id);
}

/** A single game by id, or null when it does not exist. */
export async function getGameById(db: Database, id: number): Promise<Game | null> {
    const row = await baseGamesQuery(db).where(eq(games.id, id)).get();
    return row ? mapGame(row) : null;
}
