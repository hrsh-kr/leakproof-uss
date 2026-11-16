# U2 Visual / product design

**What exists.** `pipeline.css` (253 lines) is already the Stripe-like language: cool off-white `#f3f4f8`, white cards, one indigo accent `#5b5bd6`, soft shadow, pill buttons, light and dark tokens, `focus-visible`, reduced-motion block. `site.css` is the older Apple-style set (blue `#0071e3`, pure black dark mode). Two palettes, two button systems. Merge, don't restyle.

**Measured contrast problems (real, cheap to fix):**
- `.pl-btn.primary` is white on dark-mode accent `#9393f2`: 2.7:1. Fail. Use `var(--accent-ink)`.
- Good green `#139a73` as text or white-on-green badge: 3.6:1. Fail for small text. Darken to about `#0e7a5a` in light mode; keep the lighter green in dark.
- Amber `#c7740c` on white: 3.5:1. Never use it for text.
- Step badge white on `#6366f1`: 4.5:1, borderline. Use the main accent.

## (a) Design system, 1 day

| Option | Pros | Cons |
|---|---|---|
| A. Promote `pipeline.css` tokens to one `tokens.css`; every page uses them | Reuses what exists; one look; about 4 h | Old marketing pages need a quick re-skin |
| B. Keep both files, build the app on `pl-` tokens only | Zero risk to the old site | Two looks; testers see an inconsistent tool |
| C. Adopt a framework (Tailwind, shadcn) | Fast components | Build step and dependencies on the VM; wastes the day |

**Recommend A.** Tokens: `--bg --card --ink --muted --line --accent --good --bad --warn` plus `-soft` variants (light and dark), radius 12/16, one shadow, 4/8/12/16/24 spacing. Type: system font, 5 sizes (12 label, 14 body, 16 base, 20 title, 32 page); mono only for real values. Eight components: **Button** (primary/secondary/danger), **Card**, **Field** (label, hint, error text), **StatusPill**, **Banner** (info/warn/error), **Table**, **Stepper**, **Modal-confirm** (for irreversible actions). Skip toasts; use inline Banners.

## (b) Trust without theatre
- **Status is words plus icon plus colour, never colour alone.** States: Draft, Sealed, Awaiting quorum (2 of 3), Unlocked, Refused, Failed. A refusal states the rule that fired ("window not open until 09:00").
- **Lock metaphor only where state is true.** The padlock icon appears if and only if the data really is AES-encrypted (bound to state, not decoration). No shield badges or "100% secure" copy.
- **Secret marking.** Plaintext question text, answer keys and key shares get a distinct `Secret` style: dashed border, mono, "visible to you only" label, and a click-to-reveal for key shares. Ciphertext and hashes use the normal mono style with a short fingerprint (first 8 characters, copy button). No secret ever goes in a URL or a toast.
- **Show:** who did what, when, the log hash, the verify result, and why an action is blocked. **Hide:** raw shares, stack traces, other seats' copies, internal IDs.
- **Honesty banner** on the demo build: the VM has no real HSM, and test data is not real exam data. Security theatre is claiming more than that.

## (c) Accessibility, cheap and worth it
Contrast at least 4.5:1 (fix the list above); 3px focus ring (exists); every control reachable by Tab; native `<button>`, `<label for>` and `<dialog>` instead of div widgets; reduced-motion block (exists); 44px touch targets on the phone seat view; no hover-only info; `aria-live="polite"` on the status and refusal region; error text tied with `aria-describedby`. Phone: single column under 640px, big seat-copy view. Laptop: the 380px + fluid two-pane layout already works.

## (d) Do NOT polish
Animations (the pulse, the fly-in file reveals, the drag ghost); drag-and-drop; the Apple marketing scenes; custom icons beyond about 6 inline SVGs; a theme toggle beyond system preference; pixel perfection above 1280px. Spend the hours on error states and empty states, since classmates will hit those first.

**Biggest risk:** the design pass eats security time. Cap it at one day, tokens first, and freeze it.
