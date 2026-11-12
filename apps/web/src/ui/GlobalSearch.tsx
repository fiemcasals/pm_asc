import React, { useEffect, useMemo, useRef, useState } from 'react';
import { fetchConsorcios, type ConsorcioResumen } from '../consorcios/consorcios';
import { fetchMaquinasFirmante, type MaquinaAsignada } from '../firmante/firmante';
import {
  filterCommandItems,
  type CommandItem,
  type Vista,
} from './command';
import { IconArrowRight, IconSearch } from './Icons';

interface GlobalSearchProps {
  onNavigate: (vista: Vista) => void;
  onSelectConsorcio: (consorcioId: string) => void;
  onSelectMaquina: (maquinaId: string) => void;
}

export function GlobalSearch({
  onNavigate,
  onSelectConsorcio,
  onSelectMaquina,
}: GlobalSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [consorcios, setConsorcios] = useState<ConsorcioResumen[]>([]);
  const [maquinas, setMaquinas] = useState<MaquinaAsignada[]>([]);
  const [datosCargados, setDatosCargados] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || datosCargados) return;
    let cancelled = false;
    void Promise.all([
      fetchConsorcios().catch(() => ({ ok: false as const, data: undefined })),
      fetchMaquinasFirmante().catch(() => ({ ok: false as const, data: [] as MaquinaAsignada[] })),
    ]).then(([resConsorcios, resMaquinas]) => {
      if (cancelled) return;
      if (resConsorcios.ok && resConsorcios.data) {
        setConsorcios(resConsorcios.data);
      }
      if (resMaquinas.ok && resMaquinas.data) {
        setMaquinas(resMaquinas.data);
      }
      setDatosCargados(true);
    });
    return () => {
      cancelled = true;
    };
  }, [open, datosCargados]);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  const items = useMemo<CommandItem[]>(() => {
    const base: CommandItem[] = [
      {
        id: 'nav-firmante',
        group: 'Navegación',
        title: 'Portal Firmante (RT Legal)',
        subtitle: 'Liquidación, auditoría de fotos y firma AGC',
        keywords: 'firmante rt legal agc liquidacion',
        action: () => onNavigate('firmante'),
      },
      {
        id: 'nav-eca',
        group: 'Navegación',
        title: 'Portal ECA (Conservadoras)',
        subtitle: 'Cobertura mensual, alertas críticas y WhatsApp',
        keywords: 'eca conservadora cobertura alerta whatsapp',
        action: () => onNavigate('eca'),
      },
      {
        id: 'nav-secretaria',
        group: 'Navegación',
        title: 'Secretaría (Edificios y Máquinas)',
        subtitle: 'Alta de consorcios, fichas técnicas y roles',
        keywords: 'secretaria consorcios edificios maquinas roles',
        action: () => onNavigate('secretaria'),
      },
      {
        id: 'nav-sistema',
        group: 'Navegación',
        title: 'Estado del Sistema',
        subtitle: 'Salud de API, PostgreSQL + PostGIS y Service Worker',
        keywords: 'estado salud api postgres postgis sw',
        action: () => onNavigate('sistema'),
      },
    ];

    const consorcioItems: CommandItem[] = consorcios.slice(0, 8).map((c) => ({
      id: `cons-${c.id}`,
      group: 'Consorcios',
      title: c.nombre,
      subtitle: c.direccion,
      badge: `${c.cantidadMaquinas} máq.`,
      keywords: `consorcio edificio ${c.id}`,
      action: () => onSelectConsorcio(c.id),
    }));

    const maquinaItems: CommandItem[] = maquinas.slice(0, 8).map((m) => ({
      id: `maq-${m.id}`,
      group: 'Máquinas',
      title: `${m.codigoAGC} · ${m.nombre}`,
      subtitle: `${m.edificio.direccion} — ${m.eca}`,
      badge: m.estado,
      keywords: `maquina ascensor ${m.codigoAGC} ${m.edificio.consorcio}`,
      action: () => onSelectMaquina(m.id),
    }));

    return [...base, ...consorcioItems, ...maquinaItems];
  }, [consorcios, maquinas, onNavigate, onSelectConsorcio, onSelectMaquina]);

  const filtered = useMemo(() => filterCommandItems(items, query), [items, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const grouped = new Map<CommandItem['group'], CommandItem[]>();
  for (const item of filtered) {
    const list = grouped.get(item.group) ?? [];
    list.push(item);
    grouped.set(item.group, list);
  }

  const runItem = (item: CommandItem) => {
    item.action();
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((prev) => (filtered.length === 0 ? 0 : (prev + 1) % filtered.length));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((prev) =>
        filtered.length === 0 ? 0 : (prev - 1 + filtered.length) % filtered.length,
      );
      return;
    }
    if (e.key === 'Enter' && open && filtered[activeIndex]) {
      e.preventDefault();
      runItem(filtered[activeIndex]);
    }
  };

  let runningIdx = -1;

  return (
    <div className="neo-search-box" ref={containerRef}>
      <div className={`neo-search-input-wrap ${open ? 'focused' : ''}`}>
        <IconSearch size={14} className="neo-cmd-icon" />
        <input
          ref={inputRef}
          type="text"
          className="neo-search-input"
          placeholder="Buscar consorcio, máquina (M1, M2) o portal…"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          aria-label="Buscador global"
          data-testid="global-search-input"
        />
        {query && (
          <button
            type="button"
            className="neo-search-clear"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            aria-label="Limpiar búsqueda"
          >
            ✕
          </button>
        )}
      </div>

      {open && (
        <div
          className="neo-search-dropdown"
          role="listbox"
          aria-label="Resultados de búsqueda"
          data-testid="global-search-results"
        >
          <div className="neo-cmd-list">
            {filtered.length === 0 ? (
              <div className="neo-cmd-empty">Sin resultados para “{query}”.</div>
            ) : (
              Array.from(grouped.entries()).map(([groupName, groupItems]) => (
                <div key={groupName} className="neo-cmd-group">
                  <div className="neo-cmd-group-title">{groupName}</div>
                  {groupItems.map((item) => {
                    runningIdx += 1;
                    const idx = runningIdx;
                    const isActive = idx === activeIndex;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        className={`neo-cmd-item ${isActive ? 'active' : ''}`}
                        onMouseEnter={() => setActiveIndex(idx)}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => runItem(item)}
                      >
                        <div className="neo-cmd-item-text">
                          <span className="neo-cmd-item-title">{item.title}</span>
                          {item.subtitle && <span className="neo-cmd-item-sub">{item.subtitle}</span>}
                        </div>
                        <div className="neo-cmd-item-right">
                          {item.badge && <span className="neo-cmd-badge">{item.badge}</span>}
                          <IconArrowRight size={13} className="neo-cmd-arrow" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

