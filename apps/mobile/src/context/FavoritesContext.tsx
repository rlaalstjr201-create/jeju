import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  getFavorites,
  toggleFavorite as repoToggle,
} from '../data/favoritesRepository';

interface FavoritesContextValue {
  favorites: string[];
  isFavorite: (id: string) => boolean;
  toggleFavorite: (id: string) => Promise<void>;
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    getFavorites().then(setFavorites).catch(() => {});
  }, []);

  const isFavorite = useCallback((id: string) => favorites.includes(id), [favorites]);

  const toggleFavorite = useCallback(async (id: string) => {
    const next = await repoToggle(id);
    setFavorites(next);
  }, []);

  return (
    <FavoritesContext.Provider value={{ favorites, isFavorite, toggleFavorite }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext);
  if (ctx === null) throw new Error('useFavorites must be used inside FavoritesProvider');
  return ctx;
}
