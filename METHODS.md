# Method and Function Reference

This document describes **every function and method** in the Stock Options
application, in detail. For each item you will find:

- **What it does** – the exact technical behaviour.
- **Parameters** – what goes in, with types and meaning.
- **Returns** – what comes out.
- **Called from** – where in the code it is used (with `file:line`).
- **Calls** – which other helpers it uses.
- **Plain-language use** – what it is for in non-technical words.
- **Importance** – a three-level ranking: **major**, **mid**, or **minor** (see below).

The application is split into two files:

| File | Role |
| --- | --- |
| `src/stock_options.py` | The technical core: data models, JSON loading, joining, filtering, scenario maths, curve data. Almost every function here is a *pure function* (no screen, no keyboard, no side effects). |
| `src/main.py` | The console front end: menus, prompts, text formatting, and drawing the chart with Matplotlib. |

A shared design rule: **core logic never talks to the user directly.** It
receives data and returns new data. Reading input and writing output happen only
in `main.py`, through the passed-in `read_line` and `write` functions. This makes
the core testable without a real console.

---

## Importance ranking

Each item is ranked by how central it is to the application. The ranking is a
learning aid, not a judgement of code quality.

| Level | Meaning | Count |
| --- | --- | ---: |
| **Major** | Core to a headline feature or to the correctness of the whole app. If it breaks, the application stops working properly. Study these first. | 29 |
| **Mid** | Important supporting logic: validation, parsing, formatting, predicates and orchestration helpers that many parts rely on. | 39 |
| **Minor** | Small private helpers, trivial formatting, filename helpers and convenience wrappers. Useful to know, but easy to replace. | 30 |

Rule of thumb: **major** functions answer "what does the app actually do?",
**mid** functions answer "how is the data prepared and presented?", and
**minor** functions answer "which small utility keeps the code tidy?".

---

## Table of contents

- [Importance ranking](#importance-ranking)
- [Part 0 – Shared ideas](#part-0--shared-ideas)
- [Part 1 – `stock_options.py`](#part-1--stock_optionspy)
  - [1.1 Data models (classes)](#11-data-models-classes)
  - [1.2 Type aliases and constants](#12-type-aliases-and-constants)
  - [1.3 Low-level value parsers](#13-low-level-value-parsers)
  - [1.4 Building and joining data](#14-building-and-joining-data)
  - [1.5 Stock lookup](#15-stock-lookup)
  - [1.6 Option filtering](#16-option-filtering)
  - [1.7 Scenario calculation](#17-scenario-calculation)
  - [1.8 Chart curve data](#18-chart-curve-data)
  - [1.9 File access and loading](#19-file-access-and-loading)
- [Part 2 – `main.py`](#part-2--mainpy)
  - [2.1 Application state and constants](#21-application-state-and-constants)
  - [2.2 Formatting helpers](#22-formatting-helpers)
  - [2.3 Scenario report helpers](#23-scenario-report-helpers)
  - [2.4 Diagram input helpers](#24-diagram-input-helpers)
  - [2.5 Matplotlib helpers](#25-matplotlib-helpers)
  - [2.6 Summary and input interpretation](#26-summary-and-input-interpretation)
  - [2.7 Menu actions](#27-menu-actions)
  - [2.8 Menu loop and entry point](#28-menu-loop-and-entry-point)
- [Appendix – Constants at a glance](#appendix--constants-at-a-glance)

---

## Part 0 – Shared ideas

Before the individual descriptions, a few concepts recur everywhere:

- **`Decimal`** – money and prices are stored as Python `Decimal`, not `float`,
  so that cents do not drift through rounding errors.
- **`None` means "not available"** – a missing price is `None`, never `0`. A real
  price of `0` is kept as `Decimal(0)`.
- **Frozen dataclasses** – the data objects cannot be changed after creation.
  Functions return *new* tuples/objects instead of editing the old ones.
- **`conid`** – the contract ID assigned by the broker. It is the only reliable
  link between a contract record and its market-data record. Position in a JSON
  list or the strike value must never be used for matching.
- **`ask` / `bid`** – the price you pay to buy (ask) and the price you receive
  to sell (bid) for one share of the underlying. In the raw data these are the
  fields `"86"` (ask) and `"84"` (bid).
- **Multiplier** – how many shares one option contract represents (often 100).

---

## Part 1 – `stock_options.py`

### 1.1 Data models (classes)

These are the "shapes" of the data. They carry values but contain no logic; a
few derive behaviour through frozen dataclasses.

#### `DataError(Exception)` — `stock_options.py:32`

- **Importance:** **mid** — Central error type for unreadable or invalid data files.
- **What it does:** A custom exception raised whenever a supplied JSON file is
  missing, unreadable, or structurally wrong.
- **Parameters / returns:** None of its own (standard exception behaviour).
- **Raised by:** `read_json` (`:572`, `:574`), `_read_list` (`:580`),
  `pick_stock_contract` (`:259`), `build_stock` (`:280`),
  `load_dataset` (`:602`).
- **Caught by:** `main()` in `main.py:513`, which prints a friendly message and
  returns exit code `1`.
- **Plain-language use:** The app's way of saying "I cannot use the data files
  you gave me" in a clean, recoverable way instead of crashing with a raw error.

#### `Stock` — `stock_options.py:36`

- **Importance:** **major** — Core data model for an equity; used by search and summary.
- **What it does:** Represents one share/stock with its identifying and pricing
  information. `frozen=True`.
- **Fields:**
  - `ticker: str` – short symbol, e.g. `NVDA`.
  - `company_name: str` – full company name.
  - `con_id: str` – normalized broker contract ID of the stock.
  - `currency: str` – e.g. `USD` (upper-cased).
  - `last_price: Decimal | None` – last known price, or `None`.
  - `price_note: str | None` – price-quality marker: `"C"` (previous close) or
    `"H"` (trading halt), or `None`.
- **Created by:** `build_stock` (`:284`).
- **Used by:** Anywhere a stock is displayed or searched (`find_stock`,
  `format_stock`, etc.).
- **Plain-language use:** A small record describing an equity: what it is called,
  which broker ID it has, and what it last cost.

#### `OptionContract` — `stock_options.py:47`

- **Importance:** **major** — Holds the fixed terms of an option; basis for filtering and pricing.
- **What it does:** The *definition* of an option (the contract's fixed terms),
  separate from its current market prices. `frozen=True`.
- **Fields:**
  - `conid: str` – broker contract ID.
  - `ticker: str` – underlying stock symbol.
  - `right: str` – `"P"` (Put) or `"C"` (Call).
  - `strike: Decimal` – agreed strike price.
  - `maturity_date: date` – expiry date.
  - `currency: str` – trade currency.
  - `multiplier: int` – shares per contract.
- **Created by:** `build_option_contract` (`:319`).
- **Used by:** embedded inside `Option.contract`, and throughout filtering and
  calculations.
- **Plain-language use:** The paperwork of an option: what it lets you buy/sell,
  at what price, until when, and in what currency.

#### `Option` — `stock_options.py:59`

- **Importance:** **major** — Contract plus live quote; the unit that is filtered and calculated.
- **What it does:** A contract *plus* its live quote. `frozen=True`.
- **Fields:**
  - `contract: OptionContract` – the fixed terms.
  - `ask: Decimal | None` – price to buy one share.
  - `bid: Decimal | None` – price to sell one share.
  - `quote_available: bool` – whether a market-data record existed at all.
- **Created by:** `attach_quote` (`:324`, `:325`).
- **Used by:** filtering, scenario calculation, curve generation, the diagram.
- **Plain-language use:** A tradable option: its terms together with what it
  currently costs to buy or sell.

#### `OptionFilter` — `stock_options.py:68`

- **Importance:** **major** — Defines all search criteria for the filter feature.
- **What it does:** Holds optional search criteria. `frozen=True`. A field that is
  `None` means "this criterion is not set".
- **Fields:** `ticker`, `right`, `month` (`str | None`), `strike_min`,
  `strike_max` (`Decimal | None`).
- **Created by:** `build_filter_from_input` (`main.py:369`) and
  `normalize_filter` (`:358`).
- **Used by:** `normalize_filter`, `validate_filter`, `build_predicates`,
  `filter_options`, `describe_filter`.
- **Plain-language use:** The set of "ticks" a user places in the filter screen:
  which stock, which type, which expiry month, and a strike range.

#### `ScenarioResult` — `stock_options.py:78`

- **Importance:** **major** — Primary output of the scenario calculation.
- **What it does:** The outcome of "what-if I bought this option and held it to
  expiry". `frozen=True`.
- **Fields:**
  - `option: Option` – the option analysed.
  - `assumed_price: Decimal` – the share price we assumed at expiry.
  - `intrinsic_value: Decimal` – value per share at expiry.
  - `contract_value: Decimal` – `intrinsic_value * multiplier`.
  - `cost: Decimal` – `ask * multiplier` (what was paid).
  - `profit_loss: Decimal` – `contract_value - cost`.
  - `currency: str` – reporting currency.
- **Created by:** `calculate_scenario` (`:486`).
- **Used by:** scenario report formatting and `totals_by_currency`.
- **Plain-language use:** One line of a "what happens if…" result: the value at
  expiry, what you paid, and the resulting gain or loss.

#### `CalculationIssue` — `stock_options.py:90`

- **Importance:** **mid** — Reports options excluded from the scenario, with reasons.
- **What it does:** A record explaining why a particular option could **not** be
  calculated. `frozen=True`.
- **Fields:** `option: Option`, `reason: str`.
- **Created by:** `calculate_scenario` (`:481`).
- **Used by:** `format_issue_lines` in `main.py`.
- **Plain-language use:** A clear "this one was skipped because…" note, so the
  user is never silently missing a result.

#### `ScenarioTotals` — `stock_options.py:97`

- **Importance:** **mid** — Per-currency totals for the scenario report.
- **What it does:** Summed totals for all results that share one currency.
  `frozen=True`.
- **Fields:** `currency`, `count`, `contract_value`, `cost`, `profit_loss`.
- **Created by:** `totals_by_currency` (`:504`).
- **Used by:** `format_totals_lines` in `main.py`.
- **Plain-language use:** The grand-total row per currency, so you can see the
  overall result of the whole selection at a glance.

#### `RejectedContract` — `stock_options.py:107`

- **Importance:** **mid** — Documents contracts discarded during loading.
- **What it does:** Describes an option contract that was discarded while
  loading, and why. `frozen=True`.
- **Fields:** `conid: str | None`, `ticker: str`, `reason: str`.
- **Created by:** `build_option_contract` (`:298`, `:318`),
  `drop_duplicate_options` (`:347`).
- **Used by:** `load_dataset` (collected into `Dataset.rejected`), displayed by
  `summarize`.
- **Plain-language use:** A "discarded because it was broken or duplicated" slip
  so bad data is reported, not ignored.

#### `Dataset` — `stock_options.py:115`

- **Importance:** **major** — Top-level container of all loaded data.
- **What it does:** The complete loaded data set in one immutable object.
  `frozen=True`.
- **Fields:** `stocks: tuple[Stock, ...]`, `options: tuple[Option, ...]`,
  `rejected: tuple[RejectedContract, ...]`.
- **Created by:** `load_dataset` (`:607`).
- **Used by:** `main()` → `summarize` → `run_menu`; carried inside `AppState`.
- **Plain-language use:** Everything the app knows after reading the files: the
  stocks, all usable options, and the list of discarded records.

---

### 1.2 Type aliases and constants

- **`OptionPredicate`** (`:354`) – `Callable[[Option], bool]`. A function that
  answers "does this option match?" Used by the filter predicates.
- **`Payoff`** (`:426`) – `Callable[[Decimal, Decimal], Decimal]`. A function that
  turns (share price, strike) into the option's value per share.
- **`PAYOFFS`** (`:437`) – read-only mapping `{"C": call_intrinsic, "P":
  put_intrinsic}`. This is the "functions as values" idea: the correct maths is
  looked up by the option type instead of an `if/else`. Used in
  `scenario_problems` and `calculate_scenario`.

---

### 1.3 Low-level value parsers

These turn raw JSON values (which may be strings, numbers, `null`, or garbage)
into clean Python values. They are the app's defensive layer.

#### `_is_missing(value)` — `stock_options.py:124`

- **Importance:** **minor** — Tiny private check for empty or null values.
- **What it does:** Returns `True` when the value is `None`, or a string that is
  empty or only whitespace.
- **Parameters:** `value: Any` – any raw value.
- **Returns:** `bool`.
- **Called from:** `parse_price` (`:138`), `parse_int` (`:172`).
- **Calls:** nothing.
- **Plain-language use:** A tiny check for "this field was actually filled in or
  not?"

#### `_clean_text(value)` — `stock_options.py:128`

- **Importance:** **minor** — Tiny private string-trimming helper.
- **What it does:** If the value is a string, returns it trimmed; if the trimmed
  result is empty, returns `None`. Non-strings return `None`.
- **Parameters:** `value: Any`.
- **Returns:** `str | None`.
- **Called from:** `parse_right` (`:196`), `_first_text` (`:243`),
  `build_stock` (`:274`), `build_option_contract` (`:304`, `:305`).
- **Plain-language use:** "Give me the real text of this field, or nothing if it
  is blank."

#### `parse_price(value)` — `stock_options.py:132`

- **Importance:** **major** — Central money parser; correctness affects every price and calculation.
- **What it does:** Converts a raw value into a non-negative `Decimal` price.
  - Rejects `bool`, `None`, empty/blank strings.
  - Accepts `int`, finite `float`, and numeric strings matching
    `123.45` or `1,234.50` (comma = thousands, dot = decimal).
  - Rejects negative numbers. Keeps a genuine `0` as `Decimal(0)` and turns
    `-0.0` into `0`.
- **Parameters:** `value: Any`.
- **Returns:** `Decimal | None` (`None` if missing/unreadable/negative).
- **Called from:** `parse_last_price` (`:166`, `:168`), `build_option_contract`
  (`:301`, strike), `attach_quote` (`:325`, ask & bid), and in `main.py`:
  `_parse_strike_input` (`:360`), `resolve_price_range` (`:263-264`),
  `action_calculate_scenario` (`:424`).
- **Calls:** `_is_missing`.
- **Plain-language use:** The universal "read a price from the data safely" tool.
  It never invents a `0` for a missing price.

#### `parse_last_price(value)` — `stock_options.py:157`

- **Importance:** **mid** — Parses the stock price field including its quality marker.
- **What it does:** Parses the stock price field `"31"`, which may carry a
  quality prefix: `"C131.20"` → `(Decimal("131.20"), "C")`. If the numeric part
  is unreadable, both results are `None` (no point showing a prefix without a
  price).
- **Parameters:** `value: Any`.
- **Returns:** `tuple[Decimal | None, str | None]` = `(price, quality_prefix)`.
- **Called from:** `build_stock` (`:282`).
- **Calls:** `parse_price`.
- **Plain-language use:** Reads the stock's last price while keeping its
  "quality flag" (previous close vs. halted trading) for display.

#### `parse_int(value)` — `stock_options.py:170`

- **Importance:** **mid** — Parses integer fields such as the multiplier.
- **What it does:** Converts a value to `int` when it is a real integer (int,
  integral float, or a `+/-` integer string). Otherwise `None`.
- **Parameters:** `value: Any`.
- **Returns:** `int | None`.
- **Called from:** `build_option_contract` (`:303`, multiplier).
- **Calls:** `_is_missing`.
- **Plain-language use:** Safely reads whole numbers such as the contract
  multiplier.

#### `parse_maturity(value)` — `stock_options.py:182`

- **Importance:** **mid** — Validates and converts the expiry date.
- **What it does:** Converts `"YYYYMMDD"` (string or integer) into a `date`.
  Returns `None` for wrong length, non-digits, or invalid calendar dates.
- **Parameters:** `value: Any`.
- **Returns:** `date | None`.
- **Called from:** `build_option_contract` (`:302`, maturityDate).
- **Plain-language use:** Turns a compact date code such as `20261218` into a real
  calendar date.

#### `parse_right(value)` — `stock_options.py:194`

- **Importance:** **mid** — Normalizes the Put/Call option type.
- **What it does:** Normalizes the option type to exactly `"P"` or `"C"`
  (uppercase). Anything else → `None`.
- **Parameters:** `value: Any`.
- **Returns:** `str | None`.
- **Called from:** `build_option_contract` (`:300`).
- **Calls:** `_clean_text`.
- **Plain-language use:** Understands whether a contract is a Put or a Call
  regardless of letter case.

#### `normalize_conid(value)` — `stock_options.py:199`

- **Importance:** **mid** — Canonicalizes contract IDs; important for reliable joins.
- **What it does:** Turns a contract ID (int, integral float, or digit string)
  into a plain string with no leading zeros. Raises `ValueError` for anything
  else.
- **Parameters:** `value: Any`.
- **Returns:** `str`.
- **Raises:** `ValueError`.
- **Called from:** `try_normalize_conid` (`:216`).
- **Plain-language use:** Makes sure the same contract ID is written the same way
  (`123` and `"0123"` both become `"123"`), so matching always works.

#### `try_normalize_conid(value)` — `stock_options.py:213`

- **Importance:** **mid** — Safe wrapper used throughout joining and selection.
- **What it does:** Same as `normalize_conid` but returns `None` instead of
  raising.
- **Parameters:** `value: Any`.
- **Returns:** `str | None`.
- **Called from:** `index_by_conid` (`:236`), `build_stock` (`:272`),
  `build_option_contract` (`:299`), and `main.py:select_scenario_options`
  (`:217`).
- **Calls:** `normalize_conid`.
- **Plain-language use:** The forgiving version used in normal data flow: "clean
  the ID if possible, otherwise treat it as missing."

#### `month_key(day)` — `stock_options.py:220`

- **Importance:** **mid** — Derives the expiry-month filter key from a date.
- **What it does:** Produces the expiry-month key from a date, e.g.
  `date(2026, 12, 18)` → `"DEC26"` (`_MONTH_ABBREVIATIONS` + 2-digit year).
- **Parameters:** `day: date`.
- **Returns:** `str`.
- **Called from:** `month_is` (`:388`).
- **Plain-language use:** Turns the full expiry date into the short month label
  people filter by (e.g. "DEC26").

---

### 1.4 Building and joining data

#### `index_by_conid(entries)` — `stock_options.py:226`

- **Importance:** **major** — Builds the conid lookup that makes contract/quote joining possible.
- **What it does:** Builds a lookup dictionary from many market-data records,
  keyed by normalized `conid`. Records without a valid `conid` are skipped. If
  the same `conid` appears twice, the **later** record wins.
- **Parameters:** `entries: Iterable[Any]` – raw market-data records (dicts).
- **Returns:** `Mapping[str, Mapping[str, Any]]`.
- **Called from:** `build_stock` (`:281`), `join_options` (`:331`).
- **Calls:** `try_normalize_conid`.
- **Plain-language use:** Creates an address book that maps each contract ID to
  its price record, so prices can be looked up instantly and safely.

#### `_first_text(raw, *keys)` — `stock_options.py:241`

- **Importance:** **minor** — Private fallback helper for alternate field names.
- **What it does:** Returns the first non-blank text found among the given keys,
  else `None`.
- **Parameters:** `raw: Mapping[str, Any]`, `*keys: str` – candidate field names
  (e.g. `company_name`, `companyName`, `desc1`).
- **Returns:** `str | None`.
- **Called from:** `pick_stock_contract` (`:254`), `build_stock` (`:273`, `:283`).
- **Calls:** `_clean_text`.
- **Plain-language use:** Handles the fact that different data files may use
  different names for the same thing.

#### `pick_stock_contract(raw, ticker)` — `stock_options.py:245`

- **Importance:** **mid** — Selects the matching stock record from a file.
- **What it does:** From a single object or a list of stock-contract objects,
  selects the one whose `symbol`/`ticker` matches the filename ticker. An object
  with no symbol at all is also accepted (fallback to the filename ticker). If
  nothing matches, raises `DataError`.
- **Parameters:** `raw: Any`, `ticker: str`.
- **Returns:** `Mapping[str, Any]` (one chosen contract object).
- **Raises:** `DataError`.
- **Called from:** `build_stock` (`:271`).
- **Calls:** `_first_text`.
- **Plain-language use:** Picks the right stock record when a file contains
  several, or trusts the filename when the record has no symbol.

#### `build_stock(contract_raw, marketdata_raw, ticker)` — `stock_options.py:262`

- **Importance:** **major** — Assembles a complete Stock from contract and market data.
- **What it does:** Builds a complete `Stock` by:
  1. picking the matching contract (`pick_stock_contract`);
  2. normalizing `con_id`, reading company name (`company_name` /
     `companyName` / `desc1`) and currency;
  3. raising `DataError` if `con_id`, company name, or currency is missing;
  4. finding the stock's market-data record by `con_id` and reading field `"31"`;
  5. using `symbol`/`ticker` (or the filename ticker) as the ticker.
- **Parameters:** `contract_raw: Any`, `marketdata_raw: Iterable[Any]`,
  `ticker: str`.
- **Returns:** `Stock`.
- **Raises:** `DataError`.
- **Called from:** `load_stock` (`:586`).
- **Calls:** `pick_stock_contract`, `try_normalize_conid`, `_first_text`,
  `_clean_text`, `index_by_conid`, `parse_last_price`.
- **Plain-language use:** Assembles one stock record out of its contract file and
  its price file, and refuses to continue if essential fields are missing.

#### `build_option_contract(raw, ticker)` — `stock_options.py:295`

- **Importance:** **major** — Validates and builds option contracts, rejecting bad records.
- **What it does:** Validates one raw option-contract record. If valid, returns
  an `OptionContract`. If not, returns a `RejectedContract` whose reason lists
  every problem found:
  - not a JSON object;
  - `conid` missing/invalid;
  - `right` not `P`/`C`;
  - `strike` missing, invalid, or `<= 0`;
  - `maturityDate` not a valid `YYYYMMDD`;
  - `multiplier` missing or `<= 0`;
  - `currency` missing;
  - `symbol` does not match the ticker.
- **Parameters:** `raw: Any`, `ticker: str`.
- **Returns:** `OptionContract | RejectedContract`.
- **Called from:** `join_options` (`:332`).
- **Calls:** `try_normalize_conid`, `parse_right`, `parse_price`,
  `parse_maturity`, `parse_int`, `_clean_text`.
- **Plain-language use:** Inspects each option's paperwork and either accepts it
  or says exactly what is wrong with it.

#### `attach_quote(contract, quote)` — `stock_options.py:321`

- **Importance:** **major** — Combines a contract with its quote to create an Option.
- **What it does:** Combines a valid contract with an optional market-data record.
  Reads ask (`"86"`) and bid (`"84"`). If no record exists, produces an `Option`
  with `ask=None`, `bid=None`, `quote_available=False`.
- **Parameters:** `contract: OptionContract`, `quote: Mapping[str, Any] | None`.
- **Returns:** `Option`.
- **Called from:** `join_options` (`:335`).
- **Calls:** `parse_price`.
- **Plain-language use:** Sticks the current buy/sell prices onto an option, or
  marks it clearly as "no market data" if there are none.

#### `join_options(contracts_raw, marketdata_raw, ticker)` — `stock_options.py:327`

- **Importance:** **major** — Core contract-to-quote joining for one ticker and month.
- **What it does:** Builds all options for one ticker/month:
  1. index market data by `conid`;
  2. validate every contract (`build_option_contract`);
  3. split into valid contracts and rejected records;
  4. attach the matching quote to each valid contract.
- **Parameters:** `contracts_raw: Iterable[Any]`, `marketdata_raw:
  Iterable[Any]`, `ticker: str`.
- **Returns:** `tuple[tuple[Option, ...], tuple[RejectedContract, ...]]`.
- **Called from:** `load_options` (`:593`).
- **Calls:** `index_by_conid`, `build_option_contract`, `attach_quote`.
- **Plain-language use:** Marries each option's terms with its prices using the
  contract ID, and separately collects the invalid ones.

#### `drop_duplicate_options(options)` — `stock_options.py:338`

- **Importance:** **mid** — Removes duplicate conids and reports them.
- **What it does:** Keeps the first occurrence of each `conid`; every later
  occurrence is returned as a `RejectedContract` with reason "duplicate conid".
  Preserves input order.
- **Parameters:** `options: tuple[Option, ...]`.
- **Returns:** `tuple[tuple[Option, ...], tuple[RejectedContract, ...]]`.
- **Called from:** `load_dataset` (`:605`).
- **Plain-language use:** Removes double entries that could otherwise be bought
  or counted twice, and reports them.

---

### 1.5 Stock lookup

#### `normalize_ticker(value)` — `stock_options.py:286`

- **Importance:** **minor** — Trivial ticker normalization.
- **What it does:** Trims whitespace and upper-cases a ticker.
- **Parameters:** `value: str`.
- **Returns:** `str`.
- **Called from:** `find_stock` (`:292`), `normalize_filter` (`:360`).
- **Plain-language use:** Makes `" nvda "` and `"NVDA"` mean the same stock.

#### `find_stock(ticker, stocks)` — `stock_options.py:290`

- **Importance:** **major** — Implements stock lookup for the search feature.
- **What it does:** Finds the first stock whose normalized ticker equals the
  normalized search text; returns `None` if none match.
- **Parameters:** `ticker: str`, `stocks: Iterable[Stock]`.
- **Returns:** `Stock | None`.
- **Called from:** `main.py`: `search_stock_lines` (`:86`),
  `filter_result_lines` (`:135`), `price_prompt` (`:223`).
- **Calls:** `normalize_ticker`.
- **Plain-language use:** Looks up a stock by the symbol the user typed.

---

### 1.6 Option filtering

The filter is built from small "predicate" functions (functions that return
`True`/`False`), then combined. This keeps each rule tiny and testable.

#### `normalize_filter(criteria)` — `stock_options.py:356`

- **Importance:** **mid** — Cleans filter input before matching.
- **What it does:** Returns a new `OptionFilter` with ticker, right, and month
  trimmed and upper-cased. Other fields are left as-is.
- **Parameters:** `criteria: OptionFilter`.
- **Returns:** `OptionFilter` (new copy).
- **Called from:** `filter_options` (`:417`), and `main.py`: `describe_filter`
  (`:93`), `filter_result_lines` (`:132`), `build_filter_from_input` (`:369`).
- **Calls:** `normalize_ticker`.
- **Plain-language use:** Cleans up the user's filter input so matching is not
  sensitive to case or stray spaces.

#### `validate_filter(criteria)` — `stock_options.py:365`

- **Importance:** **mid** — Produces clear validation errors for filters.
- **What it does:** Checks an already-normalized filter and returns human-readable
  error messages (empty tuple = valid):
  - ticker set but empty;
  - right not `P`/`C`;
  - month not matching `JAN..DEC + 2 digits` (e.g. `DEC26`);
  - `strike_min > strike_max`.
- **Parameters:** `criteria: OptionFilter`.
- **Returns:** `tuple[str, ...]`.
- **Called from:** `filter_options` (`:418`), `main.py:build_filter_from_input`
  (`:376`).
- **Calls:** `_MONTH_KEY_PATTERN`.
- **Plain-language use:** Explains what is wrong with a filter before it is used.

#### `ticker_is(ticker)` — `stock_options.py:378`

- **Importance:** **minor** — Small predicate factory for the ticker criterion.
- **What it does:** Returns a predicate that is true when the option's underlying
  ticker equals `ticker`.
- **Parameters:** `ticker: str`.
- **Returns:** `OptionPredicate`.
- **Called from:** `build_predicates` (`:401`).
- **Plain-language use:** "Keep only options on this stock."

#### `right_is(right)` — `stock_options.py:382`

- **Importance:** **minor** — Small predicate factory for the type criterion.
- **What it does:** Returns a predicate matching the option type (`"P"`/`"C"`).
- **Parameters:** `right: str`.
- **Returns:** `OptionPredicate`.
- **Called from:** `build_predicates` (`:402`).
- **Plain-language use:** "Keep only Puts" (or only Calls).

#### `month_is(key)` — `stock_options.py:386`

- **Importance:** **minor** — Small predicate factory for the month criterion.
- **What it does:** Returns a predicate matching the expiry month key
  (e.g. `"DEC26"`), derived from the full maturity date.
- **Parameters:** `key: str`.
- **Returns:** `OptionPredicate`.
- **Called from:** `build_predicates` (`:403`).
- **Calls:** `month_key`.
- **Plain-language use:** "Keep only options expiring in this month."

#### `strike_at_least(minimum)` — `stock_options.py:390`

- **Importance:** **minor** — Small predicate factory for the minimum strike.
- **What it does:** Predicate: strike `>= minimum` (inclusive).
- **Parameters:** `minimum: Decimal`.
- **Returns:** `OptionPredicate`.
- **Called from:** `build_predicates` (`:404`).
- **Plain-language use:** "Keep only strikes at or above this value."

#### `strike_at_most(maximum)` — `stock_options.py:394`

- **Importance:** **minor** — Small predicate factory for the maximum strike.
- **What it does:** Predicate: strike `<= maximum` (inclusive).
- **Parameters:** `maximum: Decimal`.
- **Returns:** `OptionPredicate`.
- **Called from:** `build_predicates` (`:405`).
- **Plain-language use:** "Keep only strikes at or below this value."

#### `build_predicates(criteria)` — `stock_options.py:398`

- **Importance:** **mid** — Turns filter criteria into combined predicates.
- **What it does:** For each criterion that is set (not `None`), builds the
  matching predicate; returns them as a tuple.
- **Parameters:** `criteria: OptionFilter` (normalized).
- **Returns:** `tuple[OptionPredicate, ...]`.
- **Called from:** `filter_options` (`:421`).
- **Calls:** `ticker_is`, `right_is`, `month_is`, `strike_at_least`,
  `strike_at_most`.
- **Plain-language use:** Turns the filter checkboxes into concrete "keep if…"
  rules.

#### `filter_options(options, criteria)` — `stock_options.py:409`

- **Importance:** **major** — Core implementation of the option filter feature.
- **What it does:** Normalizes and validates the filter, builds predicates, and
  keeps only options that satisfy **all** predicates (logical AND). Input order
  is preserved; input data is not modified. With no criteria set, returns every
  option. Raises `ValueError` (with all problems) for an invalid filter.
- **Parameters:** `options: Iterable[Option]`, `criteria: OptionFilter`.
- **Returns:** `tuple[Option, ...]`.
- **Raises:** `ValueError`.
- **Called from:** `main.py:action_filter_options` (`:404`).
- **Calls:** `normalize_filter`, `validate_filter`, `build_predicates`.
- **Plain-language use:** Applies the whole search form at once and returns the
  options that match every chosen condition.

---

### 1.7 Scenario calculation

The scenario answers: "If I buy **one contract** at the ask and hold it to
expiry, what is my profit or loss at a given share price?"

#### `call_intrinsic(spot, strike)` — `stock_options.py:428`

- **Importance:** **major** — Core Call payoff formula.
- **What it does:** Intrinsic value per share of a Call at expiry:
  `max(0, spot - strike)`.
- **Parameters:** `spot: Decimal` (share price), `strike: Decimal`.
- **Returns:** `Decimal`.
- **Called from:** indirectly via `PAYOFFS["C"]` in `calculate_scenario`
  (`:483`).
- **Plain-language use:** What a Call is actually worth if the share price ends
  at `spot`: it is worth the difference, or nothing if it is not profitable.

#### `put_intrinsic(spot, strike)` — `stock_options.py:432`

- **Importance:** **major** — Core Put payoff formula.
- **What it does:** Intrinsic value per share of a Put at expiry:
  `max(0, strike - spot)`.
- **Parameters:** `spot: Decimal`, `strike: Decimal`.
- **Returns:** `Decimal`.
- **Called from:** indirectly via `PAYOFFS["P"]` in `calculate_scenario`
  (`:483`).
- **Plain-language use:** What a Put is worth: the amount the strike exceeds the
  share price, or nothing.

#### `_is_finite_decimal(value)` — `stock_options.py:439`

- **Importance:** **minor** — Private numeric safety check.
- **What it does:** Returns `True` only if the value is a `Decimal` and is finite
  (not NaN/Infinity).
- **Parameters:** `value: Any`.
- **Returns:** `bool`.
- **Called from:** `scenario_problems` (`:462`, `:465`), `curve_problems`
  (`:520`).
- **Plain-language use:** A safety check that a number is a real, usable number.

#### `_ask_problem(option)` — `stock_options.py:443`

- **Importance:** **minor** — Private helper explaining unusable ask prices.
- **What it does:** Explains why an option's ask is unusable for a buy scenario,
  in priority order: no market data → ask missing → ask is `0` → ask negative.
  Returns `None` when the ask is fine.
- **Parameters:** `option: Option`.
- **Returns:** `str | None`.
- **Called from:** `scenario_problems` (`:463`, twice).
- **Calls:** `_is_finite_decimal`.
- **Plain-language use:** States plainly why an option cannot be priced for the
  "buy at ask" scenario.

#### `scenario_problems(option, assumed_price)` — `stock_options.py:455`

- **Importance:** **mid** — Central validation of all scenario preconditions.
- **What it does:** Checks every prerequisite for calculating a scenario and
  returns a tuple of human-readable problems (empty = calculable):
  - assumed share price missing / not finite / negative;
  - ask problem (from `_ask_problem`);
  - unknown option type (not in `PAYOFFS`);
  - strike missing or `<= 0`;
  - maturity date not a `date`;
  - currency missing;
  - multiplier not a positive integer.
- **Parameters:** `option: Option`, `assumed_price: Any`.
- **Returns:** `tuple[str, ...]`.
- **Called from:** `calculate_scenario` (`:479`), `profit_loss_curve` (`:545`),
  `main.py:action_chart` (`:460`).
- **Calls:** `_is_finite_decimal`, `_ask_problem`, `PAYOFFS`.
- **Plain-language use:** A pre-flight checklist that says whether the maths can
  be done at all, and why not if it cannot.

#### `calculate_scenario(option, assumed_price)` — `stock_options.py:472`

- **Importance:** **major** — Core profit/loss calculation for one option.
- **What it does:** Computes the buy-and-hold-to-expiry result:
  - `intrinsic = PAYOFFS[right](assumed_price, strike)`;
  - `contract_value = intrinsic * multiplier`;
  - `cost = ask * multiplier`;
  - `profit_loss = contract_value - cost`.
  If any preconditions fail, returns a `CalculationIssue` instead.
- **Parameters:** `option: Option`, `assumed_price: Decimal | None`.
- **Returns:** `ScenarioResult | CalculationIssue`.
- **Called from:** `calculate_scenarios` (`:495`), `profit_loss_curve` (`:550`).
- **Calls:** `scenario_problems`, `PAYOFFS`.
- **Plain-language use:** Works out the money outcome for one option at one
  assumed share price.

#### `calculate_scenarios(options, prices)` — `stock_options.py:488`

- **Importance:** **major** — Applies the scenario across the whole selection.
- **What it does:** Runs `calculate_scenario` for many options, looking up each
  option's assumed share price by its ticker in `prices`. Missing ticker prices
  cause those options to be reported as issues. Splits outcomes into results and
  issues.
- **Parameters:** `options: Iterable[Option]`, `prices: Mapping[str, Decimal]`.
- **Returns:** `tuple[tuple[ScenarioResult, ...], tuple[CalculationIssue, ...]]`.
- **Called from:** `main.py:action_calculate_scenario` (`:429`).
- **Calls:** `calculate_scenario`.
- **Plain-language use:** Runs the "what if" calculation across the whole
  selection, using one assumed price per stock.

#### `totals_by_currency(results)` — `stock_options.py:500`

- **Importance:** **mid** — Aggregates scenario totals per currency.
- **What it does:** Groups results by currency and sums `contract_value`, `cost`,
  and `profit_loss`, with a count. Currencies are **not** converted. Currencies
  are processed in sorted order.
- **Parameters:** `results: Iterable[ScenarioResult]`.
- **Returns:** `tuple[ScenarioTotals, ...]`.
- **Called from:** `main.py:scenario_report_lines` (`:206`).
- **Plain-language use:** Adds up the totals for each currency separately, so
  dollars and euros are never mixed.

---

### 1.8 Chart curve data

#### `curve_problems(min_price, max_price, steps)` — `stock_options.py:518`

- **Importance:** **mid** — Validates chart range and resolution.
- **What it does:** Validates chart parameters and returns error messages (empty
  = valid):
  - min/max must be finite Decimals;
  - min must not be negative;
  - min must be less than max;
  - `steps` must be an integer `>= 2`.
- **Parameters:** `min_price: Any`, `max_price: Any`, `steps: Any`.
- **Returns:** `tuple[str, ...]`.
- **Called from:** `profit_loss_curve` (`:542`).
- **Calls:** `_is_finite_decimal`.
- **Plain-language use:** Checks the chart's price range and resolution are
  sensible before drawing.

#### `profit_loss_curve(option, min_price, max_price, steps)` — `stock_options.py:531`

- **Importance:** **major** — Core data generation for the chart.
- **What it does:** Produces the data points for the chart:
  1. validate range/steps (`curve_problems`);
  2. validate the option (`scenario_problems`);
  3. create `steps` evenly spaced prices from `min_price` to `max_price`
     (both inclusive);
  4. compute profit/loss for each point via `calculate_scenario`.
  Returns pairs `(share_price, profit_loss)`. Raises `ValueError` on invalid
  input or an uncalculable option.
- **Parameters:** `option: Option`, `min_price: Decimal`, `max_price: Decimal`,
  `steps: int`.
- **Returns:** `tuple[tuple[Decimal, Decimal], ...]`.
- **Raises:** `ValueError`.
- **Called from:** `main.py:action_chart` (`:468`).
- **Calls:** `curve_problems`, `scenario_problems`, `calculate_scenario`.
- **Plain-language use:** Generates the "profit/loss over share price" line that
  becomes the chart, without needing any drawing library.

---

### 1.9 File access and loading

#### `stock_file_names(ticker)` — `stock_options.py:554`

- **Importance:** **minor** — Trivial filename construction.
- **What it does:** Returns the two expected filenames for a stock:
  `"{ticker}_stock_contract.json"` and `"{ticker}_stock_marketdata.json"`.
- **Parameters:** `ticker: str`.
- **Returns:** `tuple[str, str]`.
- **Called from:** `load_stock` (`:585`).
- **Plain-language use:** Knows exactly which two files describe a given stock.

#### `option_file_names(ticker, month)` — `stock_options.py:558`

- **Importance:** **minor** — Trivial filename construction.
- **What it does:** Returns the two expected filenames for the options of a
  ticker/month:
  `"{ticker}_{month}_option_contracts.json"` and
  `"{ticker}_{month}_option_marketdata.json"`.
- **Parameters:** `ticker: str`, `month: str`.
- **Returns:** `tuple[str, str]`.
- **Called from:** `load_options` (`:592`).
- **Plain-language use:** Knows which two files describe the options for one
  stock and one expiry month.

#### `read_json(path)` — `stock_options.py:562`

- **Importance:** **major** — Single file-access gateway with friendly error handling.
- **What it does:** Reads and parses a UTF-8 JSON file. Converts missing file,
  I/O errors, and JSON syntax errors into a `DataError` with a clear message.
- **Parameters:** `path: Path`.
- **Returns:** `Any` (parsed JSON).
- **Raises:** `DataError`.
- **Called from:** `_read_list` (`:578`), `load_stock` (`:586`).
- **Plain-language use:** The one place that actually opens a data file, with
  friendly error handling.

#### `_read_list(path)` — `stock_options.py:576`

- **Importance:** **minor** — Private wrapper ensuring a JSON list.
- **What it does:** Reads a JSON file (`read_json`) and insists the result is a
  list; otherwise raises `DataError`.
- **Parameters:** `path: Path`.
- **Returns:** `list[Any]`.
- **Raises:** `DataError`.
- **Called from:** `load_stock` (`:586`), `load_options` (`:593`).
- **Calls:** `read_json`.
- **Plain-language use:** Reads a file that is supposed to contain a list of
  records, and complains if it does not.

#### `load_stock(data_dir, ticker)` — `stock_options.py:583`

- **Importance:** **mid** — Loads and builds one stock from disk.
- **What it does:** Resolves the stock's two filenames, reads the contract file
  and the market-data list, and builds a `Stock` via `build_stock`.
- **Parameters:** `data_dir: Path`, `ticker: str`.
- **Returns:** `Stock`.
- **Raises:** `DataError`.
- **Called from:** `load_dataset` (`:603`).
- **Calls:** `stock_file_names`, `read_json`, `_read_list`, `build_stock`.
- **Plain-language use:** Loads everything about one stock from disk.

#### `load_options(data_dir, ticker, month)` — `stock_options.py:588`

- **Importance:** **mid** — Loads and joins the options of one ticker and month.
- **What it does:** Resolves the option filenames for a ticker/month, reads the
  contract list and market-data list, and joins them via `join_options`.
- **Parameters:** `data_dir: Path`, `ticker: str`, `month: str`.
- **Returns:** `tuple[tuple[Option, ...], tuple[RejectedContract, ...]]`.
- **Raises:** `DataError`.
- **Called from:** `load_dataset` (`:604`).
- **Calls:** `option_file_names`, `_read_list`, `join_options`.
- **Plain-language use:** Loads all options for one stock and one expiry month
  from disk.

#### `load_dataset(data_dir)` — `stock_options.py:595`

- **Importance:** **major** — Top-level orchestration of all data loading.
- **What it does:** The top-level loader:
  1. checks `data_dir` is a directory (else `DataError`);
  2. loads all stocks for every ticker in `TICKERS`;
  3. loads all option sets for every ticker × month in `TICKERS × MONTHS`;
  4. flattens options, removes duplicate `conid`s (`drop_duplicate_options`);
  5. collects all rejected records plus the duplicates;
  6. returns a `Dataset`.
- **Parameters:** `data_dir: Path`.
- **Returns:** `Dataset`.
- **Raises:** `DataError`.
- **Called from:** `main.py:main` (`:512`).
- **Calls:** `load_stock`, `load_options`, `drop_duplicate_options`.
- **Plain-language use:** Reads the entire data folder in one go and hands back
  a complete, cleaned data set.

---

## Part 2 – `main.py`

### 2.1 Application state and constants

#### `AppState` (dataclass) — `main.py:41`

- **Importance:** **major** — Immutable session state that drives the whole menu.
- **What it does:** An immutable snapshot of the current session. Every menu
  action returns either the same state or a new one (via
  `dataclasses.replace`), never mutating it.
- **Fields:**
  - `dataset: Dataset` – all loaded data (never modified).
  - `selection: tuple[Option, ...] = ()` – the last non-empty filter result;
    the basis for scenario and chart.
  - `selection_filter: OptionFilter | None = None` – the criteria that produced
    that selection, shown in the menu.
- **Created by:** `run_menu` (`:493`).
- **Used by:** every action (`action_*`), `menu_text`.
- **Plain-language use:** Remembers, for the duration of the session, what data
  was loaded and which options the user currently has selected.

#### `default_data_dir()` — `main.py:53`

- **Importance:** **minor** — Trivial default path calculation.
- **What it does:** Computes the default data folder as
  `<repo root>/data/json`, based on the location of `main.py`
  (`Path(__file__).resolve().parents[2] / "data" / "json"`).
- **Parameters:** none.
- **Returns:** `Path`.
- **Called from:** `main` (`:510`) when no folder argument is given.
- **Plain-language use:** Finds the bundled data folder regardless of where the
  program is started from.

Module-level constants also live here: `_QUALITY_TEXT` and `_RIGHT_TEXT`
(display text), `MAX_TABLE_ROWS = 50`, `MAX_ISSUE_ROWS = 20`,
`CURVE_STEPS = 201`, `DIAGRAM_PATH`, and the colour/UI constants used for the
chart. See the [Appendix](#appendix--constants-at-a-glance).

---

### 2.2 Formatting helpers

These are pure functions that turn data into display strings. None of them print;
they return text that the caller writes.

#### `format_price(stock)` — `main.py:59`

- **Importance:** **mid** — Formats price with currency and quality; used in several views.
- **What it does:** Formats a stock's price with currency and price quality. If
  there is no price, returns `"kein Kurs verfügbar"` (never `0`). Quality notes
  are translated via `_QUALITY_TEXT`.
- **Parameters:** `stock: Stock`.
- **Returns:** `str`.
- **Called from:** `format_stock` (`:68`), `format_stock_detail` (`:75`),
  `price_prompt` (`:224`).
- **Plain-language use:** Prints a price nicely, with its currency and a note if
  the price is stale or from a trading halt.

#### `format_stock(stock)` — `main.py:66`

- **Importance:** **minor** — One-line stock formatting for the summary.
- **What it does:** Formats one aligned summary line: ticker, company name,
  `con_id`, and price.
- **Parameters:** `stock: Stock`.
- **Returns:** `str`.
- **Called from:** `summarize` (`:342`).
- **Calls:** `format_price`.
- **Plain-language use:** One tidy row for a stock in the startup overview.

#### `format_stock_detail(stock)` — `main.py:70`

- **Importance:** **minor** — Small detail formatter for stock search.
- **What it does:** Returns three labelled lines (ticker, company, price) for a
  found stock.
- **Parameters:** `stock: Stock`.
- **Returns:** `tuple[str, ...]`.
- **Called from:** `search_stock_lines` (`:89`).
- **Calls:** `format_price`.
- **Plain-language use:** The detailed result shown when a user searches a
  stock.

#### `available_tickers(stocks)` — `main.py:78`

- **Importance:** **minor** — Trivial list join for error hints.
- **What it does:** Joins all stock tickers with commas.
- **Parameters:** `stocks: tuple[Stock, ...]`.
- **Returns:** `str`.
- **Called from:** `search_stock_lines` (`:85`, `:88`),
  `filter_result_lines` (`:134`).
- **Plain-language use:** Produces the "available: AMD, AAPL, NVDA" hint for
  error messages.

#### `search_stock_lines(user_input, stocks)` — `main.py:82`

- **Importance:** **mid** — Builds the complete stock-search output.
- **What it does:** Produces the result of a stock search:
  - empty input → message plus available tickers;
  - unknown ticker → message plus available tickers;
  - known ticker → detailed lines.
- **Parameters:** `user_input: str`, `stocks: tuple[Stock, ...]`.
- **Returns:** `tuple[str, ...]`.
- **Called from:** `action_search_stock` (`:388`).
- **Calls:** `available_tickers`, `find_stock`, `format_stock_detail`.
- **Plain-language use:** Handles the "search a stock" screen, including typos
  and blanks.

#### `describe_filter(criteria)` — `main.py:91`

- **Importance:** **mid** — Human-readable description of active filters.
- **What it does:** Normalizes the filter and builds a readable summary of the
  active criteria, e.g. `"Ticker=NVDA, Typ=P, Strike >= 150"`, or
  `"keine Filter (alle Optionen)"` if nothing is set.
- **Parameters:** `criteria: OptionFilter`.
- **Returns:** `str`.
- **Called from:** `filter_result_lines` (`:137`, `:139`), `menu_text` (`:485`).
- **Calls:** `normalize_filter`.
- **Plain-language use:** Describes in words which filters are currently active.

#### `ordered_options(options)` — `main.py:105`

- **Importance:** **mid** — Consistent option ordering used by tables and charts.
- **What it does:** Returns a new tuple sorted by ticker, maturity date, right,
  then strike. Does not change the input.
- **Parameters:** `options: tuple[Option, ...]`.
- **Returns:** `tuple[Option, ...]`.
- **Called from:** `format_option_table` (`:121`), `action_chart` (`:453`).
- **Plain-language use:** Puts options in a predictable, easy-to-scan order.

#### `format_option_row(option)` — `main.py:109`

- **Importance:** **minor** — Formats a single table row.
- **What it does:** Formats one option table row: ticker, type (P/C as PUT/CALL),
  maturity date, strike, ask (or `"kein Ask"`), multiplier, currency.
- **Parameters:** `option: Option`.
- **Returns:** `str`.
- **Called from:** `format_option_table` (`:125`).
- **Plain-language use:** One line describing an option in the results table.

#### `format_option_table(options, max_rows=MAX_TABLE_ROWS)` — `main.py:118`

- **Importance:** **mid** — Renders the option result table.
- **What it does:** Builds a header, a separator, up to `max_rows` sorted rows,
  and a footer noting how many rows were hidden. The full selection is kept; only
  the display is limited.
- **Parameters:** `options: tuple[Option, ...]`,
  `max_rows: int = MAX_TABLE_ROWS` (50).
- **Returns:** `tuple[str, ...]`.
- **Called from:** `filter_result_lines` (`:140`), `format_option_choice_table`
  (`:231`).
- **Calls:** `ordered_options`, `format_option_row`.
- **Plain-language use:** Renders the options result table, capped for
  readability while keeping everything in memory.

#### `filter_result_lines(criteria, result, stocks)` — `main.py:127`

- **Importance:** **mid** — Assembles the full filter-result output.
- **What it does:** Produces the filter screen output. If no options matched,
  returns a "nothing found for …" line and, if the ticker was unknown, a hint
  listing available tickers. Otherwise returns a count line plus the table.
- **Parameters:** `criteria: OptionFilter`, `result: tuple[Option, ...]`,
  `stocks: tuple[Stock, ...]`.
- **Returns:** `tuple[str, ...]`.
- **Called from:** `action_filter_options` (`:405`).
- **Calls:** `normalize_filter`, `available_tickers`, `find_stock`,
  `describe_filter`, `format_option_table`.
- **Plain-language use:** Builds the complete "here is what your filter found"
  message, including helpful hints when nothing matched.

#### `_money(value)` — `main.py:143`

- **Importance:** **minor** — Tiny money formatting helper.
- **What it does:** Formats a Decimal with exactly two decimals, no sign.
- **Parameters:** `value: Decimal`.
- **Returns:** `str`.
- **Called from:** `format_scenario_row` (`:158-160`), `format_totals_lines`
  (`:195-196`).
- **Plain-language use:** Money formatting for neutral amounts.

#### `_signed_money(value)` — `main.py:147`

- **Importance:** **minor** — Tiny signed money formatting helper.
- **What it does:** Formats a Decimal with a forced sign and two decimals
  (`+12.34`, `-115.00`).
- **Parameters:** `value: Decimal`.
- **Returns:** `str`.
- **Called from:** `format_scenario_row` (`:159`), `format_totals_lines`
  (`:196`).
- **Plain-language use:** Money formatting for gains and losses so the sign is
  always visible.

---

### 2.3 Scenario report helpers

#### `format_scenario_row(result)` — `main.py:153`

- **Importance:** **minor** — Formats one scenario table row.
- **What it does:** Formats one scenario line using `_SCENARIO_ROW`: ticker,
  type, strike, maturity, assumed price, intrinsic value, contract value, cost,
  profit/loss, currency.
- **Parameters:** `result: ScenarioResult`.
- **Returns:** `str`.
- **Called from:** `format_scenario_table` (`:173`).
- **Calls:** `_money`, `_signed_money`.
- **Plain-language use:** One row of the "what-if" result table.

#### `format_scenario_table(results, max_rows=MAX_TABLE_ROWS)` — `main.py:162`

- **Importance:** **mid** — Renders the scenario result table.
- **What it does:** Sorts results by the same key as options, emits a header,
  separator, up to `max_rows` rows, and a "… N more not shown" footer.
- **Parameters:** `results: tuple[ScenarioResult, ...]`,
  `max_rows: int = MAX_TABLE_ROWS`.
- **Returns:** `tuple[str, ...]`.
- **Called from:** `scenario_report_lines` (`:206`).
- **Calls:** `format_scenario_row`.
- **Plain-language use:** Renders the scenario result table.

#### `format_issue_lines(issues, max_rows=MAX_ISSUE_ROWS)` — `main.py:175`

- **Importance:** **mid** — Explains skipped options grouped by reason.
- **What it does:** For options that could not be calculated:
  - returns nothing if there are no issues;
  - counts issues per reason;
  - sorts and shows up to `max_rows` individual cases with conid and reason;
  - adds a footer for hidden cases.
- **Parameters:** `issues: tuple[CalculationIssue, ...]`,
  `max_rows: int = MAX_ISSUE_ROWS` (20).
- **Returns:** `tuple[str, ...]`.
- **Called from:** `scenario_report_lines` (`:209`).
- **Plain-language use:** Explains which options were skipped and why, grouped by
  reason.

#### `format_totals_lines(totals)` — `main.py:192`

- **Importance:** **minor** — Formats the totals lines.
- **What it does:** Formats one clearly-labelled `SUMME` line per currency, noting
  "1 contract per option" and showing contract value, cost, and profit/loss.
- **Parameters:** `totals: tuple[ScenarioTotals, ...]`.
- **Returns:** `tuple[str, ...]`.
- **Called from:** `scenario_report_lines` (`:206`).
- **Calls:** `_money`, `_signed_money`.
- **Plain-language use:** The grand-total summary lines per currency.

#### `scenario_report_lines(results, issues)` — `main.py:200`

- **Importance:** **mid** — Assembles the full scenario report.
- **What it does:** Assembles the full scenario report:
  - if there are results: a count line, the scenario table, and totals;
  - if not: `"Keine Option berechenbar."`;
  - if there are issues: a blank line plus the issue report.
- **Parameters:** `results: tuple[ScenarioResult, ...]`,
  `issues: tuple[CalculationIssue, ...]`.
- **Returns:** `tuple[str, ...]`.
- **Called from:** `action_calculate_scenario` (`:430`).
- **Calls:** `format_scenario_table`, `totals_by_currency`,
  `format_totals_lines`, `format_issue_lines`.
- **Plain-language use:** Puts the whole scenario result screen together: table,
  totals, and skipped-option explanations.

#### `select_scenario_options(selection, conid_text)` — `main.py:211`

- **Importance:** **mid** — Chooses the whole selection or one option by conid.
- **What it does:** If `conid_text` is blank, returns the whole selection. If a
  `conid` is entered, returns just the matching option(s) from the selection,
  or an error message if that `conid` is not in the current selection.
- **Parameters:** `selection: tuple[Option, ...]`, `conid_text: str`.
- **Returns:** `tuple[tuple[Option, ...], str | None]` = `(options, error)`.
- **Called from:** `action_calculate_scenario` (`:417`).
- **Calls:** `try_normalize_conid`.
- **Plain-language use:** Lets the user calculate either the whole selection or a
  single chosen option.

#### `price_prompt(ticker, stocks)` — `main.py:221`

- **Importance:** **minor** — Builds the assumed-price prompt.
- **What it does:** Builds the prompt for entering an assumed share price,
  including the stored price as a hint if the ticker is known.
- **Parameters:** `ticker: str`, `stocks: tuple[Stock, ...]`.
- **Returns:** `str`.
- **Called from:** `action_calculate_scenario` (`:424`).
- **Calls:** `find_stock`, `format_price`.
- **Plain-language use:** Provides a friendly question ("Assumed share price
  NVDA (stored: 240.60 USD): ") when asking for a what-if price.

---

### 2.4 Diagram input helpers

#### `format_option_choice_table(ordered, max_rows=MAX_TABLE_ROWS)` — `main.py:229`

- **Importance:** **mid** — Numbered option list for chart selection.
- **What it does:** Takes the option table and prefixes each displayed row with a
  right-aligned number, so the user can pick an option by number. Numbers apply
  to the whole sorted list; hidden rows are handled as in the base table.
- **Parameters:** `ordered: tuple[Option, ...]`,
  `max_rows: int = MAX_TABLE_ROWS`.
- **Returns:** `tuple[str, ...]`.
- **Called from:** `action_chart` (`:454`).
- **Calls:** `format_option_table`.
- **Plain-language use:** Shows a numbered list of selected options to choose from
  for the chart.

#### `parse_choice_index(text, count)` — `main.py:236`

- **Importance:** **minor** — Validates a typed option number.
- **What it does:** Parses a typed selection number. Returns it as an `int` only
  if it is ASCII digits and `1 <= number <= count`; otherwise `None` (also for
  non-ASCII digits, which could otherwise sneak past `isdigit`).
- **Parameters:** `text: str`, `count: int`.
- **Returns:** `int | None`.
- **Called from:** `action_chart` (`:455`).
- **Plain-language use:** Validates the number the user typed when choosing an
  option.

#### `suggest_price_range(strike)` — `main.py:241`

- **Importance:** **minor** — Suggests a default chart range.
- **What it does:** Suggests a chart price range from 50 % to 150 % of the strike,
  rounded down (floor) on the minimum and up (ceiling) on the maximum to whole
  numbers.
- **Parameters:** `strike: Decimal`.
- **Returns:** `tuple[Decimal, Decimal]` = `(min_price, max_price)`.
- **Called from:** `resolve_price_range` (`:262`), `ask_price_range` (`:435`).
- **Plain-language use:** Offers a sensible default chart range that comfortably
  straddles the strike.

#### `price_range_problems(strike, min_price, max_price)` — `main.py:248`

- **Importance:** **minor** — Small validation helper for chart ranges.
- **What it does:** Checks that `min < max` and that the range contains the strike
  (`min < strike < max`); returns readable error texts.
- **Parameters:** `strike: Decimal`, `min_price: Decimal`, `max_price: Decimal`.
- **Returns:** `tuple[str, ...]`.
- **Called from:** `resolve_price_range` (`:271`).
- **Plain-language use:** Ensures the chart range is valid and actually shows both
  the profit and loss sides around the strike.

#### `resolve_price_range(strike, min_text, max_text)` — `main.py:258`

- **Importance:** **mid** — Parses and validates the chart price range.
- **What it does:** Interprets two text inputs for the range. Blank input means
  "use the suggestion". Parses each with `parse_price`; unreadable values produce
  errors. Then validates the range. Returns `(range, errors)`; on any problem the
  range is `None`.
- **Parameters:** `strike: Decimal`, `min_text: str`, `max_text: str`.
- **Returns:** `tuple[tuple[Decimal, Decimal] | None, tuple[str, ...]]`.
- **Called from:** `ask_price_range` (`:443`).
- **Calls:** `suggest_price_range`, `parse_price`, `price_range_problems`.
- **Plain-language use:** Turns the user's typed chart range (or blanks) into a
  validated min/max pair, with clear problems if invalid.

---

### 2.5 Matplotlib helpers

These are the only functions that touch the plotting library, and the import is
done **inside** the functions so the rest of the app works without Matplotlib.

#### `create_profit_loss_figure(option, curve)` — `main.py:280`

- **Importance:** **major** — Core chart rendering.
- **What it does:** Builds a Matplotlib figure (no display, no saving) plotting
  profit/loss against share price. Adds a zero line, a dashed strike marker, a
  title (ticker/type/strike/expiry), labelled axes with currency, grid,
  removed top/right spines, and a legend showing ask and multiplier. Uses a
  consistent style via `plt.rc_context`. Raises `ImportError` if Matplotlib is
  absent.
- **Parameters:** `option: Option`,
  `curve: tuple[tuple[Decimal, Decimal], ...]` (from `profit_loss_curve`).
- **Returns:** a Matplotlib `Figure`.
- **Raises:** `ImportError`.
- **Called from:** `action_chart` (`:470`), inside a `try` for `ImportError`.
- **Plain-language use:** Draws the profit/loss chart of one option.

#### `save_figure(figure, path)` — `main.py:315`

- **Importance:** **mid** — Persists the chart as a PNG file.
- **What it does:** Creates the target folder if needed and saves the figure as
  PNG at 150 dpi, preserving the figure background colour. Returns the path.
- **Parameters:** `figure` (Matplotlib figure), `path: Path`.
- **Returns:** `Path`.
- **Called from:** `action_chart` (`:475`).
- **Plain-language use:** Writes the chart to an image file on disk.

#### `show_and_close(figure)` — `main.py:321`

- **Importance:** **mid** — Shows the chart when an interactive window is available.
- **What it does:** Checks the current Matplotlib backend. If it is interactive
  (not in `_NON_INTERACTIVE_BACKENDS`), shows the window and then closes the
  figure; otherwise just closes it. Returns whether a window was shown.
- **Parameters:** `figure`.
- **Returns:** `bool` (`True` if displayed).
- **Called from:** `action_chart` (`:478`).
- **Plain-language use:** Tries to pop up the chart on screen; if the environment
  has no display, it simply closes it and the PNG remains.

---

### 2.6 Summary and input interpretation

#### `summarize(dataset)` — `main.py:336`

- **Importance:** **mid** — Builds the startup data overview.
- **What it does:** Produces the startup overview lines (pure, no printing):
  number of stocks, a formatted line per stock, total options, options without
  ask, options without market data, count of rejected contracts and their
  reasons.
- **Parameters:** `dataset: Dataset`.
- **Returns:** `tuple[str, ...]`.
- **Called from:** `main` (`:516`).
- **Calls:** `format_stock`.
- **Plain-language use:** The "what did we load" summary shown when the app
  starts.

#### `_blank_to_none(text)` — `main.py:352`

- **Importance:** **minor** — Tiny blank-to-None helper.
- **What it does:** Returns `None` for blank/whitespace text, otherwise the
  trimmed text.
- **Parameters:** `text: str`.
- **Returns:** `str | None`.
- **Called from:** `build_filter_from_input` (`:370-372`).
- **Plain-language use:** Interprets an empty filter field as "not set".

#### `_parse_strike_input(label, text)` — `main.py:356`

- **Importance:** **minor** — Small optional strike parser.
- **What it does:** Parses a strike-limit text field. Blank → `(None, ())`;
  unreadable → `(None, (error,))`; valid → `(Decimal, ())`. The `label` names the
  field in the error message.
- **Parameters:** `label: str`, `text: str`.
- **Returns:** `tuple[Decimal | None, tuple[str, ...]]`.
- **Called from:** `build_filter_from_input` (`:367-368`).
- **Calls:** `_blank_to_none`, `parse_price`.
- **Plain-language use:** Safely reads an optional strike limit, explaining a bad
  value clearly.

#### `build_filter_from_input(ticker, right, month, strike_min, strike_max)` — `main.py:363`

- **Importance:** **mid** — Turns raw filter input into a validated filter.
- **What it does:** Builds an `OptionFilter` from five raw text inputs. Converts
  blanks to `None`, parses the two strike limits, normalizes the filter, and
  collects parse errors plus `validate_filter` errors. If any error exists,
  returns `(None, errors)`; otherwise `(filter, ())`.
- **Parameters:** `ticker: str`, `right: str`, `month: str`, `strike_min: str`,
  `strike_max: str`.
- **Returns:** `tuple[OptionFilter | None, tuple[str, ...]]`.
- **Called from:** `action_filter_options` (`:394`).
- **Calls:** `_parse_strike_input`, `_blank_to_none`, `normalize_filter`,
  `validate_filter`.
- **Plain-language use:** Turns the five filter questions into a validated filter
  object, or a list of problems to show the user.

---

### 2.7 Menu actions

Each action has the same signature `(state, read_line, write) -> AppState`,
receives input/output functions as parameters, and returns the (possibly new)
state. This is what allows the menu logic to be tested without a real console.

#### `write_lines(lines, write)` — `main.py:381`

- **Importance:** **minor** — Tiny output helper.
- **What it does:** Calls the given `write` function once per line.
- **Parameters:** `lines: tuple[str, ...]`, `write: Write`.
- **Returns:** `None`.
- **Called from:** `action_search_stock` (`:388`),
  `action_filter_options` (`:402`, `:405`), `action_calculate_scenario`
  (`:430`), `ask_price_range` (`:446`), `action_chart` (`:454`).
- **Plain-language use:** A small helper to print several lines through the
  injected output function.

#### `action_search_stock(state, read_line, write)` — `main.py:386`

- **Importance:** **major** — Menu feature 1: stock search.
- **What it does:** Menu item "Aktie suchen" (search stock). Asks for a ticker,
  prints the search result lines, and returns the state unchanged.
- **Parameters:** `state: AppState`, `read_line: ReadLine`, `write: Write`.
- **Returns:** `AppState` (same state).
- **Called from:** `run_menu` via the `actions` map (`:492`).
- **Calls:** `read_line`, `search_stock_lines`, `write_lines`.
- **Plain-language use:** The "look up a stock by symbol" menu screen.

#### `action_filter_options(state, read_line, write)` — `main.py:391`

- **Importance:** **major** — Menu feature 2: option filtering and selection.
- **What it does:** Menu item "Optionen filtern" (filter options). Prompts for the
  five criteria, builds/validates the filter, runs `filter_options`, prints the
  result, and stores a non-empty result as the new selection (with its filter)
  via `replace`. On invalid input or empty result, keeps the previous state.
- **Parameters:** `state: AppState`, `read_line: ReadLine`, `write: Write`.
- **Returns:** `AppState` (new selection on success, else unchanged).
- **Called from:** `run_menu` via the `actions` map (`:492`).
- **Calls:** `build_filter_from_input`, `filter_options`, `filter_result_lines`,
  `write_lines`, `write`; uses `dataclasses.replace`.
- **Plain-language use:** The "search options with filters" screen and the place
  where the current selection is remembered.

#### `action_calculate_scenario(state, read_line, write)` — `main.py:412`

- **Importance:** **major** — Menu feature 3: scenario calculation.
- **What it does:** Menu item "Szenario berechnen" (calculate scenario). Requires
  a selection. Optionally narrows to one `conid`, asks for an assumed price per
  distinct ticker, validates the numbers, runs `calculate_scenarios`, and prints
  the report. State is unchanged.
- **Parameters:** `state: AppState`, `read_line: ReadLine`, `write: Write`.
- **Returns:** `AppState` (same state).
- **Called from:** `run_menu` via the `actions` map (`:492`).
- **Calls:** `select_scenario_options`, `price_prompt`, `parse_price`,
  `calculate_scenarios`, `scenario_report_lines`, `write_lines`.
- **Plain-language use:** The "what is my profit/loss at expiry" screen, with one
  assumed price per stock.

#### `ask_price_range(option, read_line, write)` — `main.py:433`

- **Importance:** **mid** — Interactive chart range prompt with retry.
- **What it does:** Repeatedly prompts for the chart's price range (blank = use
  suggestion), allowing `q` to cancel. On invalid values, prints the problems and
  asks again. Returns the validated range or `None` if cancelled.
- **Parameters:** `option: Option`, `read_line: ReadLine`, `write: Write`.
- **Returns:** `tuple[Decimal, Decimal] | None`.
- **Called from:** `action_chart` (`:464`).
- **Calls:** `suggest_price_range`, `resolve_price_range`, `write_lines`.
- **Plain-language use:** Asks for the chart's price range, offering good defaults
  and letting the user cancel.

#### `action_chart(state, read_line, write)` — `main.py:448`

- **Importance:** **major** — Menu feature 4: chart generation.
- **What it does:** Menu item "Diagramm" (chart). Requires a selection. Shows a
  numbered option list, parses the chosen number, rejects options that cannot be
  charted (`scenario_problems`), asks for a price range, computes the curve
  (`profit_loss_curve`), creates the figure, saves it to `DIAGRAM_PATH`, and
  optionally shows it. Handles a missing Matplotlib and save errors gracefully.
  State is unchanged.
- **Parameters:** `state: AppState`, `read_line: ReadLine`, `write: Write`.
- **Returns:** `AppState` (same state).
- **Called from:** `run_menu` via the `actions` map (`:492`).
- **Calls:** `ordered_options`, `format_option_choice_table`, `parse_choice_index`,
  `scenario_problems`, `ask_price_range`, `profit_loss_curve`,
  `create_profit_loss_figure`, `save_figure`, `show_and_close`, `write_lines`.
- **Plain-language use:** The "draw the profit/loss chart" screen.

---

### 2.8 Menu loop and entry point

#### `menu_text(state)` — `main.py:482`

- **Importance:** **mid** — Builds the menu and current selection status.
- **What it does:** Builds the menu text including the current selection summary
  (number of options and filter description, or "Aktuelle Auswahl: keine").
- **Parameters:** `state: AppState`.
- **Returns:** `str`.
- **Called from:** `run_menu` (`:495`).
- **Calls:** `describe_filter`.
- **Plain-language use:** The menu you see, with a reminder of what is currently
  selected.

#### `run_menu(dataset, read_line=input, write=print)` — `main.py:490`

- **Importance:** **major** — Main interactive loop.
- **What it does:** The main loop. Starts from `AppState(dataset)`, then:
  1. writes the menu;
  2. reads a choice;
  3. `"0"` exits;
  4. looks up the action in the `actions` map and runs it, updating the state;
  5. handles invalid choices and `EOFError` (Ctrl-D) by exiting cleanly.
  Default I/O is `input`/`print` but can be replaced for testing.
- **Parameters:** `dataset: Dataset`, `read_line: ReadLine = input`,
  `write: Write = print`.
- **Returns:** `AppState` (final state).
- **Called from:** `main` (`:517`).
- **Calls:** `menu_text`, all four `action_*` functions (via the map).
- **Plain-language use:** Runs the interactive menu until the user quits.

#### `main(argv)` — `main.py:508`

- **Importance:** **major** — Program entry point and startup.
- **What it does:** Program entry point:
  1. uses `argv[1]` as the data folder if given, else `default_data_dir()`;
  2. loads the dataset, catching `DataError` (prints to stderr, returns `1`);
  3. prints the summary;
  4. runs the menu;
  5. returns `0`.
- **Parameters:** `argv: list[str]` – command-line arguments (`sys.argv`).
- **Returns:** `int` – process exit code.
- **Called from:** the `if __name__ == "__main__":` block (`:521`), via
  `sys.exit(main(sys.argv))`.
- **Calls:** `default_data_dir`, `load_dataset`, `summarize`, `run_menu`.
- **Plain-language use:** Starts the whole application from the command line,
  optionally pointing it at a different data folder.

---

## Appendix – Constants at a glance

| Constant | Location | Value / meaning |
| --- | --- | --- |
| `TICKERS` | `stock_options.py:14` | `("AMD", "AAPL", "NVDA")` – stocks to load. |
| `MONTHS` | `stock_options.py:15` | `("OCT26", "NOV26", "DEC26")` – expiry months to load. |
| `_MONTH_ABBREVIATIONS` | `stock_options.py:17` | `JAN..DEC` – used by `month_key`. |
| `_QUALITY_PREFIXES` | `stock_options.py:21` | `("C", "H")` – price-quality markers. |
| `_MONTH_KEY_PATTERN` | `stock_options.py:24` | Validates month keys like `DEC26`. |
| `_PRICE_PATTERN` | `stock_options.py:25` | Validates price strings (`123.45`, `1,234.50`). |
| `_INT_PATTERN` | `stock_options.py:26` | Validates signed integer strings. |
| `_DIGITS_PATTERN` | `stock_options.py:27` | Digits only (for conid). |
| `_DATE_PATTERN` | `stock_options.py:28` | `YYYYMMDD` form. |
| `PAYOFFS` | `stock_options.py:437` | Read-only map `C → call_intrinsic`, `P → put_intrinsic`. |
| `_QUALITY_TEXT` | `main.py:31` | Maps `C`/`H` to display text. |
| `_RIGHT_TEXT` | `main.py:32` | Maps `P`/`C` to `PUT`/`CALL`. |
| `MAX_TABLE_ROWS` | `main.py:33` | `50` – max visible table rows. |
| `MAX_ISSUE_ROWS` | `main.py:34` | `20` – max individual issues shown. |
| `CURVE_STEPS` | `main.py:35` | `201` – number of chart points. |
| `DIAGRAM_PATH` | `main.py:36` | `<repo>/doc/diagramm.png`. |
| `ReadLine`, `Write` | `main.py:38-39` | Type aliases for injected I/O functions. |
| `_NON_INTERACTIVE_BACKENDS` | `main.py:276` | Backends that cannot show a window. |
| `_INK` … `_SURFACE` | `main.py:277` | Chart colours. |
| `_SCENARIO_ROW` | `main.py:151` | Format string for a scenario row. |

---

*End of reference.*
