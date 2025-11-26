export interface Word {
  word: string;
  part_of_speech: string;
  explanation: string[];
}

export interface WordWithWeight extends Word {
  weight: number;
  occurrences: number;
  totalWeight: number;
}

export interface LearningResult {
  word: string;
 unfamiliarity: number;
  occurrences: number;
  totalWeight: number;
}
