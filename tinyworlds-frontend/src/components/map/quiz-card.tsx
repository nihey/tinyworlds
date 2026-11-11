"use client";

import { ArrowRight, ArrowUpRight, Settings2, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useI18n } from "@/hooks/use-i18n";
import {
  areasOf,
  chipCounts,
  countFor,
  isLastRound,
  liveLine,
  peopleNote,
  questionKind,
  quizScore,
  tallyShares,
  type QuizChoice,
  type QuizState,
} from "@/lib/quiz";
import { cn } from "@/lib/utils";
import { QUIZ_GROUPS, QUIZ_LEVELS, type QuizQuestion } from "@/map/quiz";
import type { Sight, SightText } from "@/map/sights";

const KEYS = ["A", "B", "C", "D"];
/** The visitor's own wrong pick: a red that reads on the black sign. */
const WRONG = "#e0614a";
/** At most this many buildings is "only a handful": the count says so. */
const FEW = 10;

interface QuizCardProps {
  state: Exclude<QuizState, { phase: "off" }>;
  sights: Map<string, Sight>;
  /** the building's article, for the link once it is named; undefined while unknown */
  article: SightText | undefined;
  /** this language's questions, null while they load */
  questions: QuizQuestion[] | null;
  has: (id: string) => boolean;
  choice: QuizChoice;
  /** what the world calls its boroughs, for the borough row */
  areaLabel: string;
  onChoice: (c: QuizChoice) => void;
  onStart: () => void;
  onPick: (id: string) => void;
  onNext: () => void;
  onAgain: () => void;
  onChange: () => void;
  onStop: () => void;
}

/**
 * The card Guess the building is played on: first the choosing step (difficulty, borough, what,
 * and how many buildings that makes), then each round (the building's Wikipedia opening with its
 * name blanked and four names; then the verdict, the text whole and how everyone else
 * answered), then the end. On the right of a wide screen, a sheet at the foot of a narrower one.
 * A labelled group, not a dialog: the map's keys keep working (A–D, 1–4, Enter, Esc).
 */
export function QuizCard(props: QuizCardProps) {
  const { state, sights, article, onPick, onNext, onStop } = props;
  const { t, locale } = useI18n();
  const nextRef = useRef<HTMLButtonElement>(null);
  const againRef = useRef<HTMLButtonElement>(null);
  const answered = state.phase === "answered";
  const finished = state.phase === "finished";
  useEffect(() => {
    if (answered) nextRef.current?.focus();
  }, [answered]);
  useEffect(() => {
    if (finished) againRef.current?.focus();
  }, [finished]);

  const playing = state.phase === "asking" || state.phase === "answered";
  const game = "game" in state ? state.game : null;
  const name = (id: string) => sights.get(id)?.n ?? "";

  return (
    <div
      role="group"
      aria-label={t.quiz.title}
      className={cn(
        "quiz-card sign sign-in fixed z-20 flex flex-col overflow-y-auto",
        "right-(--edge-r) bottom-(--edge-b) left-(--edge-l) max-h-[55vh]",
        "min-[56rem]:top-(--edge-t) min-[56rem]:right-[calc(var(--edge-r)+3.75rem)] min-[56rem]:bottom-auto min-[56rem]:left-auto min-[56rem]:max-h-[calc(100vh-2*var(--edge-t))] min-[56rem]:w-[25rem]",
      )}
    >
      <div aria-hidden className="h-[3px] shrink-0 bg-taxi" />
      {/* what a screen reader is told as the game moves on: the verdict, then the score */}
      <p className="sr-only" aria-live="polite">
        {liveLine(state, name, t.quiz)}
      </p>
      <div className="flex items-center gap-2 border-b border-sign-line py-1.5 pr-1.5 pl-3">
        <span className="font-pixel text-[15px] leading-none tracking-[0.03em] text-taxi uppercase">
          {t.quiz.title}
        </span>
        <span className="ml-auto text-[12px] text-paper-dim tabular-nums">
          {playing &&
            game &&
            quizScore(t.quiz.score, game.index + 1, game.right, game.queue.length)}
        </span>
        {game && (
          <button
            type="button"
            onClick={props.onChange}
            aria-label={t.quiz.change}
            className="bullet size-7 text-paper-dim hover:text-paper"
          >
            <Settings2 className="size-3.5" strokeWidth={2.25} />
          </button>
        )}
        <button
          type="button"
          onClick={onStop}
          aria-label={t.quiz.close}
          className="bullet size-7 text-paper-dim hover:text-paper"
        >
          <X className="size-3.5" strokeWidth={2.25} />
        </button>
      </div>

      <div className="p-3">
        {game && state.phase !== "finished" && (
          <div className="mb-2 flex flex-wrap gap-1">
            {[
              t.quiz.levels[game.choice.level].name,
              game.choice.area ?? `${props.areaLabel}: ${t.quiz.allAreas}`,
              game.choice.group
                ? t.quiz.groups[game.choice.group]
                : `${t.quiz.what}: ${t.quiz.groups.all}`,
            ].map((tag) => (
              <span
                key={tag}
                className="border border-sign-line px-1.5 py-px text-[11px] leading-snug text-paper-dim"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {(state.phase === "loading" || (state.phase === "choosing" && !props.questions)) && (
          <p className="text-[14px] text-paper-dim">{t.quiz.loading}</p>
        )}

        {state.phase === "choosing" && props.questions && <Choosing {...props} />}

        {state.phase === "empty" && (
          <>
            <p className="text-[14px]">{t.quiz.empty}</p>
            <div className="mt-3 flex">
              <button
                type="button"
                onClick={onStop}
                className="px-3 py-2 text-[14px] font-semibold text-paper-dim hover:text-paper"
              >
                {t.quiz.stop}
              </button>
            </div>
          </>
        )}

        {playing && (
          <Round
            state={state}
            name={name}
            kind={questionKind(sights.get(state.question.id)?.t ?? "building")}
            article={article}
            onPick={onPick}
            onNext={onNext}
            onStop={onStop}
            nextRef={nextRef}
            locale={locale}
          />
        )}

        {state.phase === "finished" && (
          <>
            <p className="text-[15px] leading-snug font-bold">
              {t.quiz.end
                .replace("{right}", String(state.game.right))
                .replace("{total}", String(state.game.queue.length))}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                ref={againRef}
                type="button"
                onClick={props.onAgain}
                className="flex items-center gap-1.5 bg-taxi px-3 py-2 text-[14px] font-bold text-taxi-ink outline-none focus-visible:shadow-[0_0_0_2px_var(--paper)]"
              >
                {t.quiz.again}
                <ArrowRight aria-hidden className="size-4" strokeWidth={2.5} />
              </button>
              <button
                type="button"
                onClick={props.onChange}
                className="px-3 py-2 text-[14px] font-semibold text-paper hover:underline"
              >
                {t.quiz.changeChoice}
              </button>
              <button
                type="button"
                onClick={onStop}
                className="px-3 py-2 text-[14px] font-semibold text-paper-dim hover:text-paper"
              >
                {t.quiz.stop}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** A choice on the choosing step: pressed when chosen, struck out when it would leave nothing. */
function Chip({
  on,
  empty,
  onClick,
  children,
  className,
}: {
  on: boolean;
  empty: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={empty && !on}
      onClick={onClick}
      className={cn(
        "px-2.5 py-1.5 text-[13px] leading-tight font-semibold outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--taxi)]",
        on ? "bg-taxi text-taxi-ink" : "bg-sign-raised hover:bg-white/12",
        empty && !on && "line-through opacity-35 hover:bg-sign-raised",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** The choosing step: difficulty, borough, what, how many buildings that makes, and Start. */
function Choosing({ questions, has, choice, areaLabel, onChoice, onStart }: QuizCardProps) {
  const { t } = useI18n();
  const list = questions ?? [];
  const counts = chipCounts(list, choice, has);
  const n = countFor(list, choice, has);
  const words = n <= FEW ? t.quiz.few : t.quiz.count;
  const label = "mb-1.5 text-[11px] font-semibold tracking-[0.08em] text-paper-dim uppercase";
  return (
    <>
      <p className={label}>{t.quiz.difficulty}</p>
      <div className="grid grid-cols-3 gap-1">
        {QUIZ_LEVELS.map((level) => (
          <Chip
            key={level}
            on={choice.level === level}
            empty={counts.levels[level] === 0}
            onClick={() => onChoice({ ...choice, level })}
            className="py-2 text-center"
          >
            {t.quiz.levels[level].name}
            <span
              className={cn(
                "mt-0.5 block text-[11px] font-normal",
                choice.level === level ? "text-taxi-ink/75" : "text-paper-dim",
              )}
            >
              {t.quiz.levels[level].line}
            </span>
          </Chip>
        ))}
      </div>

      <p className={cn(label, "mt-3")}>{areaLabel}</p>
      <div className="flex flex-wrap gap-1">
        <Chip
          on={choice.area === null}
          empty={false}
          onClick={() => onChoice({ ...choice, area: null })}
        >
          {t.quiz.allAreas}
        </Chip>
        {areasOf(list).map((area) => (
          <Chip
            key={area}
            on={choice.area === area}
            empty={(counts.areas.get(area) ?? 0) === 0}
            onClick={() => onChoice({ ...choice, area })}
          >
            {area}
          </Chip>
        ))}
      </div>

      <p className={cn(label, "mt-3")}>{t.quiz.what}</p>
      <div className="flex flex-wrap gap-1">
        <Chip
          on={choice.group === null}
          empty={false}
          onClick={() => onChoice({ ...choice, group: null })}
        >
          {t.quiz.groups.all}
        </Chip>
        {QUIZ_GROUPS.map((group) => (
          <Chip
            key={group}
            on={choice.group === group}
            empty={(counts.groups.get(group) ?? 0) === 0}
            onClick={() => onChoice({ ...choice, group })}
          >
            {t.quiz.groups[group]}
          </Chip>
        ))}
      </div>

      <p className="mt-3.5 text-[14px]" aria-live="polite">
        {(n === 1 ? words.one : words.other).replace("{n}", String(n))}
      </p>
      <div className="mt-3 flex">
        <button
          type="button"
          onClick={onStart}
          disabled={n === 0}
          className="flex items-center gap-1.5 bg-taxi px-3 py-2 text-[14px] font-bold text-taxi-ink outline-none focus-visible:shadow-[0_0_0_2px_var(--paper)] disabled:opacity-40"
        >
          {t.quiz.start}
          <ArrowRight aria-hidden className="size-4" strokeWidth={2.5} />
        </button>
      </div>
    </>
  );
}

function Round({
  state,
  name,
  kind,
  article,
  onPick,
  onNext,
  onStop,
  nextRef,
  locale,
}: {
  state: Extract<QuizState, { phase: "asking" | "answered" }>;
  name: (id: string) => string;
  kind: ReturnType<typeof questionKind>;
  article: SightText | undefined;
  onPick: (id: string) => void;
  onNext: () => void;
  onStop: () => void;
  nextRef: React.RefObject<HTMLButtonElement | null>;
  locale: string;
}) {
  const { t } = useI18n();
  const { question, choices } = state;
  const answered = state.phase === "answered" ? state : null;
  const tally = answered && answered.tally !== "waiting" && answered.tally ? answered.tally : null;
  const counted = tally ? tallyShares(tally, choices) : null;
  const note = counted && answered ? peopleNote(counted.people, answered.recorded) : null;
  const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 });
  const number = new Intl.NumberFormat(locale);
  const right = answered?.pick === question.id;

  return (
    <>
      {answered ? (
        <p className="text-[15px] leading-snug font-bold">
          {right ? (
            <span className="text-taxi">{t.quiz.right}</span>
          ) : (
            t.quiz.wrong.replace("{name}", name(question.id))
          )}
        </p>
      ) : (
        <p className="text-[11.5px] font-semibold tracking-[0.08em] text-paper-dim uppercase">
          {t.quiz.ask[kind]}
        </p>
      )}

      <p lang={question.lang} className="mt-1.5 text-[14px] leading-[1.45]">
        {question.parts.map((part, i) =>
          i % 2 === 0 ? (
            <span key={i}>{part}</span>
          ) : answered ? (
            <strong key={i} className="font-bold text-taxi">
              {part}
            </strong>
          ) : (
            <span
              key={i}
              role="img"
              aria-label={t.quiz.blank}
              className="mx-[0.1em] inline-block h-[0.85em] w-[4.5em] translate-y-[0.1em] rounded-[2px] bg-paper/90"
            />
          ),
        )}
      </p>
      <p className="mt-1.5 text-[11.5px] text-paper-dim">
        {answered ? t.quiz.credit : t.quiz.source}
      </p>

      {counted && note && (
        <p className="mt-2 text-[13px] text-paper-dim">
          {note === "first"
            ? t.quiz.first
            : (new Intl.PluralRules(locale).select(counted.people) === "one"
                ? t.quiz.people.one
                : t.quiz.people.other
              ).replace("{n}", number.format(counted.people))}
        </p>
      )}

      <div className="mt-3 flex flex-col gap-1.5">
        {choices.map((id, i) => {
          const isRight = answered && id === question.id;
          const mine = answered?.pick === id;
          const share = counted?.shares.get(id) ?? 0;
          return (
            <button
              key={id}
              type="button"
              disabled={!!answered}
              onClick={() => onPick(id)}
              className={cn(
                "relative flex items-center gap-2.5 overflow-hidden px-2.5 py-2 text-left text-[14px] leading-snug font-semibold",
                isRight ? "bg-taxi text-taxi-ink" : "bg-sign-raised",
                !answered &&
                  "hover:bg-white/12 focus-visible:shadow-[inset_0_0_0_2px_var(--taxi)] focus-visible:outline-none",
              )}
              style={mine && !isRight ? { boxShadow: `inset 3px 0 0 ${WRONG}` } : undefined}
            >
              {counted && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute inset-y-0 left-0",
                    isRight ? "bg-black/12" : "bg-white/7",
                  )}
                  style={{ width: `${share * 100}%` }}
                />
              )}
              <span
                aria-hidden
                className={cn(
                  "relative w-3 font-pixel text-[13px]",
                  isRight ? "text-taxi-ink" : "text-paper-dim",
                )}
              >
                {KEYS[i]}
              </span>
              <span className="relative min-w-0 flex-1">
                {name(id)}
                {mine && (
                  <span className="text-[11px] font-semibold tracking-[0.06em] opacity-80">
                    {" "}
                    · {t.quiz.you}
                  </span>
                )}
              </span>
              {counted && (
                <span
                  className={cn(
                    "relative tabular-nums",
                    isRight ? "text-taxi-ink" : "text-paper-dim",
                  )}
                >
                  {percent.format(share)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {answered && (
        <div className="mt-3 flex items-center gap-2">
          <button
            ref={nextRef}
            type="button"
            onClick={onNext}
            className="flex items-center gap-1.5 bg-taxi px-3 py-2 text-[14px] font-bold text-taxi-ink outline-none focus-visible:shadow-[0_0_0_2px_var(--paper)]"
          >
            {isLastRound(state.game) ? t.quiz.seeScore : t.quiz.next}
            <ArrowRight aria-hidden className="size-4" strokeWidth={2.5} />
          </button>
          <button
            type="button"
            onClick={onStop}
            className="px-3 py-2 text-[14px] font-semibold text-paper-dim hover:text-paper"
          >
            {t.quiz.stop}
          </button>
          {article && (
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto flex items-center gap-1 text-[12.5px] font-semibold text-taxi hover:underline"
            >
              {t.sight.readOn}
              <ArrowUpRight aria-hidden className="size-3.5" strokeWidth={2.25} />
            </a>
          )}
        </div>
      )}
    </>
  );
}
