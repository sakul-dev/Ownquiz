'use strict';

const LEGACY_STORAGE_KEY = 'methods-trainer-known-v1';
const STORAGE_PREFIX = 'ownquiz.v1.';
const REGISTRY_KEY = 'ownquiz.docs.v1';
const CHUNK_SIZE = 200000;

const state = {
  cards: [],
  deck: [],
  index: 0,
  flipped: false,
  known: new Set(),
  mode: 'flashcards',
  shuffled: false,
  section: 'all',
  severity: 'all',
  source: 'METHODS.md',
  docId: '',
  savedDeckIds: null,
  storageWarning: ''
};

let quiz = { order: [], pos: 0, correct: 0, answered: 0, current: null, selected: null };
