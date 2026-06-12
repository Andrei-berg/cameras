"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  DndContext,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { moveIncidentAction } from "@/app/(dashboard)/incidents/actions";

export interface KanbanCard {
  id: string;
  objectName: string;
  cameraNumber: number;
  district: string;
  reason: string | null;
  detectedAt: string; // ISO
  state: string;
}

const COLUMNS = [
  { key: "open", title: "Открытые", accent: "border-t-fail" },
  { key: "in_repair", title: "В ремонте", accent: "border-t-warn" },
  { key: "resolved", title: "Закрытые", accent: "border-t-ok" },
] as const;

function ageLabel(iso: string) {
  const h = (Date.now() - new Date(iso).getTime()) / 3600_000;
  const label = h < 1 ? "< 1 ч" : h < 48 ? `${Math.round(h)} ч` : `${Math.round(h / 24)} д`;
  const cls = h < 24 ? "text-ok" : h < 72 ? "text-warn" : "text-fail";
  return { label, cls };
}

function Card({ card, draggable }: { card: KanbanCard; draggable: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
    disabled: !draggable,
  });
  const a = ageLabel(card.detectedAt);
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={
        transform
          ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 30 }
          : undefined
      }
      className={`bg-surface border border-line rounded-lg p-3 text-sm space-y-1 relative ${
        draggable ? "cursor-grab active:cursor-grabbing" : ""
      } ${isDragging ? "shadow-xl opacity-90" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/incidents/${card.id}`}
          className="font-medium text-accent hover:underline leading-tight"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {card.objectName} <span className="font-mono text-ink-soft">№{card.cameraNumber}</span>
        </Link>
        {card.state !== "resolved" && (
          <span className={`font-mono text-xs font-semibold whitespace-nowrap ${a.cls}`}>
            {a.label}
          </span>
        )}
      </div>
      {card.reason && <p className="text-xs text-ink-soft line-clamp-2">{card.reason}</p>}
      <p className="text-[10px] text-ink-faint">{card.district}</p>
    </div>
  );
}

function Column({
  col,
  cards,
  total,
  draggable,
}: {
  col: (typeof COLUMNS)[number];
  cards: KanbanCard[];
  total: number;
  draggable: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key });
  return (
    <div
      ref={setNodeRef}
      className={`bg-canvas/60 border border-line border-t-4 ${col.accent} rounded-lg p-2.5 flex flex-col gap-2 min-h-64 transition-colors ${
        isOver ? "bg-accent/10 border-accent" : ""
      }`}
    >
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
          {col.title}
        </h2>
        <span className="font-mono text-xs text-ink-faint">
          {cards.length < total ? `${cards.length} из ${total.toLocaleString("ru-RU")}` : total}
        </span>
      </div>
      {cards.map((c) => (
        <Card key={c.id} card={c} draggable={draggable && c.state !== "resolved"} />
      ))}
      {cards.length === 0 && (
        <p className="text-xs text-ink-faint text-center py-6">пусто</p>
      )}
    </div>
  );
}

export default function KanbanBoard({
  cards,
  totals,
  canWork,
}: {
  cards: KanbanCard[];
  totals: Record<string, number>;
  canWork: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  function onDragEnd(e: DragEndEvent) {
    const to = e.over?.id as string | undefined;
    const id = e.active.id as string;
    const card = cards.find((c) => c.id === id);
    if (!to || !card || card.state === to) return;
    startTransition(async () => {
      await moveIncidentAction(id, to);
      router.refresh();
    });
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="grid md:grid-cols-3 gap-3 items-start">
        {COLUMNS.map((col) => (
          <Column
            key={col.key}
            col={col}
            cards={cards.filter((c) => c.state === col.key)}
            total={totals[col.key] ?? 0}
            draggable={canWork}
          />
        ))}
      </div>
      {canWork && (
        <p className="text-xs text-ink-faint mt-2">
          Перетащите карточку между колонками, чтобы сменить статус. Открытие карточки — по названию объекта.
        </p>
      )}
    </DndContext>
  );
}
