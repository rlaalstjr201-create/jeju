import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'favorites';

async function load(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (raw === null) return [];
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

async function save(ids: string[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(ids));
}

export async function getFavorites(): Promise<string[]> {
  return load();
}

export async function isFavorite(id: string): Promise<boolean> {
  const ids = await load();
  return ids.includes(id);
}

export async function addFavorite(id: string): Promise<void> {
  const ids = await load();
  if (!ids.includes(id)) await save([...ids, id]);
}

export async function removeFavorite(id: string): Promise<void> {
  const ids = await load();
  await save(ids.filter((x) => x !== id));
}

export async function toggleFavorite(id: string): Promise<string[]> {
  const ids = await load();
  const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
  await save(next);
  return next;
}
