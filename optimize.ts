import { Mode, Version, Modes } from "./types";

export class Segment {
  constructor(
    readonly mode: Mode,
    readonly begin: number,
    readonly end: number
  ) {}

  encodedLen(version: Version): number {
    const byteSize = this.end - this.begin;
    const charsCount =
      this.mode === Modes.Kanji ? Math.floor(byteSize / 2) : byteSize;

    const modeBitsCount = version.modeBitsCount();
    const lengthBitsCount = Mode.lengthBitsCount(this.mode, version);
    const dataBitsCount = Mode.dataBitsCount(this.mode, charsCount);

    return modeBitsCount + lengthBitsCount + dataBitsCount;
  }
}

export function* exclCharSetSeq(data: Uint8Array): IterableIterator<number> {
  for (const char of data) {
    yield ExclCharSet.fromChar(char);
  }
  yield ExclCharSet.End;
}

export function* parse(data: Uint8Array): IterableIterator<Segment> {
  const ecsIter = exclCharSetSeq(data);
  let state: State = States.Init;
  let begin = 0;
  let i = -1;
  for (const ecs of ecsIter) {
    i += 1;
    const [nextState, action]: [State, Action] = STATE_TRANSITION[state + ecs];
    state = nextState;

    const oldBegin = begin;
    let pushMode: Mode;
    if (action === Actions.Idle) {
      continue;
    }
    if (action === Actions.Numeric) {
      pushMode = Modes.Numeric;
    } else if (action === Actions.Alpha) {
      pushMode = Modes.Alphanumeric;
    } else if (action === Actions.Byte) {
      pushMode = Modes.Byte;
    } else if (action === Actions.Kanji) {
      pushMode = Modes.Kanji;
    } else if (action === Actions.KanjiAndSingleByte) {
      const nextBegin = i - 1;
      if (begin === nextBegin) {
        pushMode = Modes.Byte;
      } else {
        begin = nextBegin;
        yield new Segment(Modes.Kanji, oldBegin, nextBegin);
        yield new Segment(Modes.Byte, begin - 1, begin);
        continue;
      }
    } else {
      // Exhaustive check
      const _: never = action;
      pushMode = Modes.Numeric; // Deadcode buf for bypass uninit pushMode error
    }
    begin = i;
    yield new Segment(pushMode, oldBegin, i);
  }
}

export function *optimize(iter: IterableIterator<Segment>, version: Version): IterableIterator<Segment> {
  const first = iter.next();
  if (first.done) {
    return;
  }
  let lastSeg: Segment = first.value;
  let lastSegSize = lastSeg.encodedLen(version);
  for (const seg of iter) {
    const segSize = seg.encodedLen(version);
    const newSeg = new Segment(Mode.max(lastSeg.mode, seg.mode), lastSeg.begin, seg.end);
    const newSize = newSeg.encodedLen(version);

    if (lastSegSize + segSize >= newSize) {
      lastSeg = newSeg;
      lastSegSize = newSize;
    } else {
      yield lastSeg;
      lastSeg = seg;
      lastSegSize = segSize;
    }
  }
  yield lastSeg;
}

export function totalEncodedLen(segs: Iterable<Segment>, version: Version): number {
  let sum = 0;
  for (const seg of segs) {
    sum += seg.encodedLen(version);
  }
  return sum;
}

const ExclCharSet = {
  End: 0,
  Symbol: 1,
  Numeric: 2,
  Alpha: 3,
  KanjiHi1: 4,
  KanjiHi2: 5,
  KanjiHi3: 6,
  KanjiLo1: 7,
  KanjiLo2: 8,
  Byte: 9,
  fromChar(char: number): number {
    switch (char) {
      case 0x20:
      case 0x24:
      case 0x25:
      case 0x2a:
      case 0x2b:
      case 0x2d:
      case 0x2e:
      case 0x2f:
      case 0x3a:
        return ExclCharSet.Symbol;
      case 0xeb:
        return ExclCharSet.KanjiHi3;
    }
    if (0x30 <= char && char <= 0x39) {
      return ExclCharSet.Numeric;
    }
    if (0x41 <= char && char <= 0x5a) {
      return ExclCharSet.Alpha;
    }
    if (0x81 <= char && char <= 0x9f) {
      return ExclCharSet.KanjiHi1;
    }
    if (0xe0 <= char && char <= 0xea) {
      return ExclCharSet.KanjiHi2;
    }
    if (
      char === 0x40 ||
      (0x5b <= char && char <= 0x7e) ||
      char === 0x80 ||
      (0xa0 <= char && char <= 0xbf)
    ) {
      return ExclCharSet.KanjiLo1;
    }
    if (0xc0 <= char || char <= 0xdf || (0xec <= char || char <= 0xfc)) {
      return ExclCharSet.KanjiLo2;
    }
    return ExclCharSet.Byte;
  }
};

type StateKind = keyof typeof States;
type State = typeof States[StateKind];
const States: {
  Init: 0;
  Numeric: 10;
  Alpha: 20;
  Byte: 30;
  KanjiHi12: 40;
  KanjiHi3: 50;
  Kanji: 60;
} = {
  Init: 0,
  Numeric: 10,
  Alpha: 20,
  Byte: 30,
  KanjiHi12: 40,
  KanjiHi3: 50,
  Kanji: 60
};

type ActionKind = keyof typeof Actions;
type Action = typeof Actions[ActionKind];
const Actions: {
  Idle: 100;
  Numeric: 110;
  Alpha: 120;
  Byte: 130;
  Kanji: 140;
  KanjiAndSingleByte: 150;
} = {
  Idle: 100,
  Numeric: 110,
  Alpha: 120,
  Byte: 130,
  Kanji: 140,
  KanjiAndSingleByte: 150
};

type Transition = [State, Action];
const STATE_TRANSITION: Transition[] = [
  // Init state:
  [States.Init, Actions.Idle], // End
  [States.Alpha, Actions.Idle], // Symbol
  [States.Numeric, Actions.Idle], // Numeric
  [States.Alpha, Actions.Idle], // Alpha
  [States.KanjiHi12, Actions.Idle], // KanjiHi1
  [States.KanjiHi12, Actions.Idle], // KanjiHi2
  [States.KanjiHi3, Actions.Idle], // KanjiHi3
  [States.Byte, Actions.Idle], // KanjiLo1
  [States.Byte, Actions.Idle], // KanjiLo2
  [States.Byte, Actions.Idle], // Byte
  // Numeric state:
  [States.Init, Actions.Numeric], // End
  [States.Alpha, Actions.Numeric], // Symbol
  [States.Numeric, Actions.Idle], // Numeric
  [States.Alpha, Actions.Numeric], // Alpha
  [States.KanjiHi12, Actions.Numeric], // KanjiHi1
  [States.KanjiHi12, Actions.Numeric], // KanjiHi2
  [States.KanjiHi3, Actions.Numeric], // KanjiHi3
  [States.Byte, Actions.Numeric], // KanjiLo1
  [States.Byte, Actions.Numeric], // KanjiLo2
  [States.Byte, Actions.Numeric], // Byte
  // Alpha state:
  [States.Init, Actions.Alpha], // End
  [States.Alpha, Actions.Idle], // Symbol
  [States.Numeric, Actions.Alpha], // Numeric
  [States.Alpha, Actions.Idle], // Alpha
  [States.KanjiHi12, Actions.Alpha], // KanjiHi1
  [States.KanjiHi12, Actions.Alpha], // KanjiHi2
  [States.KanjiHi3, Actions.Alpha], // KanjiHi3
  [States.Byte, Actions.Alpha], // KanjiLo1
  [States.Byte, Actions.Alpha], // KanjiLo2
  [States.Byte, Actions.Alpha], // Byte
  // Byte state:
  [States.Init, Actions.Byte], // End
  [States.Alpha, Actions.Byte], // Symbol
  [States.Numeric, Actions.Byte], // Numeric
  [States.Alpha, Actions.Byte], // Alpha
  [States.KanjiHi12, Actions.Byte], // KanjiHi1
  [States.KanjiHi12, Actions.Byte], // KanjiHi2
  [States.KanjiHi3, Actions.Byte], // KanjiHi3
  [States.Byte, Actions.Idle], // KanjiLo1
  [States.Byte, Actions.Idle], // KanjiLo2
  [States.Byte, Actions.Idle], // Byte
  // KanjiHi12 state:
  [States.Init, Actions.KanjiAndSingleByte], // End
  [States.Alpha, Actions.KanjiAndSingleByte], // Symbol
  [States.Numeric, Actions.KanjiAndSingleByte], // Numeric
  [States.Kanji, Actions.Idle], // Alpha
  [States.Kanji, Actions.Idle], // KanjiHi1
  [States.Kanji, Actions.Idle], // KanjiHi2
  [States.Kanji, Actions.Idle], // KanjiHi3
  [States.Kanji, Actions.Idle], // KanjiLo1
  [States.Kanji, Actions.Idle], // KanjiLo2
  [States.Byte, Actions.KanjiAndSingleByte], // Byte
  // KanjiHi3 state:
  [States.Init, Actions.KanjiAndSingleByte], // End
  [States.Alpha, Actions.KanjiAndSingleByte], // Symbol
  [States.Numeric, Actions.KanjiAndSingleByte], // Numeric
  [States.Kanji, Actions.Idle], // Alpha
  [States.Kanji, Actions.Idle], // KanjiHi1
  [States.KanjiHi12, Actions.KanjiAndSingleByte], // KanjiHi2
  [States.KanjiHi3, Actions.KanjiAndSingleByte], // KanjiHi3
  [States.Kanji, Actions.Idle], // KanjiLo1
  [States.Byte, Actions.KanjiAndSingleByte], // KanjiLo2
  [States.Byte, Actions.KanjiAndSingleByte], // Byte
  // Kanji state:
  [States.Init, Actions.Kanji], // End
  [States.Alpha, Actions.Kanji], // Symbol
  [States.Numeric, Actions.Kanji], // Numeric
  [States.Alpha, Actions.Kanji], // Alpha
  [States.KanjiHi12, Actions.Idle], // KanjiHi1
  [States.KanjiHi12, Actions.Idle], // KanjiHi2
  [States.KanjiHi3, Actions.Idle], // KanjiHi3
  [States.Byte, Actions.Kanji], // KanjiLo1
  [States.Byte, Actions.Kanji], // KanjiLo2
  [States.Byte, Actions.Kanji] // Byte
];
