// localStorageに保存する項目名と、選択可能な表示方法です。
const STORAGE_KEYS = {
  displayMode: "english-word-app.displayMode",
  wordId: "english-word-app.wordId"
};
const DISPLAY_MODES = ["translation", "image", "both"];
const PART_OF_SPEECH_CATEGORIES = [
  { value: "名詞", label: "名詞（noun）" },
  { value: "動詞", label: "動詞（verb）" },
  { value: "形容詞", label: "形容詞（adjective）" },
  { value: "副詞", label: "副詞（adverb）" }
];

// words.jsonがまだない場合に使う開発用データです。本番データとは分けて管理します。
const SAMPLE_WORDS = [
  { id: "sample-apple", english: "apple", pronunciation: "/ˈæpəl/", partOfSpeech: "名詞", translation: "りんご", image: "images/apple.jpg" },
  { id: "sample-book", english: "book", pronunciation: "/bʊk/", partOfSpeech: "名詞", translation: "本", image: "images/book.jpg" },
  { id: "sample-bird", english: "bird", pronunciation: "/bɝːd/", partOfSpeech: "名詞", translation: "鳥", image: "images/bird.jpg" },
  { id: "sample-beauty", english: "beauty", pronunciation: "/ˈbjuːti/", partOfSpeech: "名詞", translation: "美しさ", image: "images/beauty.jpg" },
  { id: "sample-run", english: "run", pronunciation: "/rʌn/", partOfSpeech: "動詞", translation: "走る", image: "images/run.jpg" }
];

const elements = {
  settingsScreen: document.getElementById("settings-screen"),
  learningScreen: document.getElementById("learning-screen"),
  wordMenuButton: document.getElementById("word-menu-button"),
  wordNavigationMenu: document.getElementById("word-navigation-menu"),
  appMessage: document.getElementById("app-message"),
  displayModeInputs: [...document.querySelectorAll('input[name="display-mode"]')],
  startButton: document.getElementById("start-learning-button"),
  wordNumber: document.getElementById("word-number"),
  englishWord: document.getElementById("english-word"),
  wordPronunciation: document.getElementById("word-pronunciation"),
  wordPartOfSpeech: document.getElementById("word-part-of-speech"),
  translationArea: document.getElementById("translation-area"),
  japaneseTranslation: document.getElementById("japanese-translation"),
  imageArea: document.getElementById("image-area"),
  wordImage: document.getElementById("word-image"),
  imagePlaceholder: document.getElementById("image-placeholder"),
  previousButton: document.getElementById("previous-word-button"),
  nextButton: document.getElementById("next-word-button"),
  playAudioButton: document.getElementById("play-audio-button"),
  openSettingsButton: document.getElementById("open-settings-button")
};

let words = [];
let currentIndex = 0;
let currentDisplayMode = null;
let savedWordId = null;
let hasUsableWords = false;

// 画面上のメッセージを更新します。
function showMessage(message) {
  elements.appMessage.textContent = message;
  elements.appMessage.hidden = message.length === 0;
}

// localStorageを利用できない場合も、アプリ自体の操作は続けられるようにします。
function readSavedState() {
  try {
    const savedMode = localStorage.getItem(STORAGE_KEYS.displayMode);
    savedWordId = localStorage.getItem(STORAGE_KEYS.wordId);
    currentDisplayMode = DISPLAY_MODES.includes(savedMode) ? savedMode : null;
    if (savedMode && !currentDisplayMode) {
      console.warn("保存された表示方法が無効なため、設定画面から開始します。");
    }
  } catch (error) {
    currentDisplayMode = null;
    savedWordId = null;
    console.warn("localStorageから設定を読み込めませんでした。保存なしで起動します。", error);
    showMessage("保存データを読み込めませんでした。今回は保存なしで利用できます。");
  }
}

// 表示方法と単語IDをそれぞれ保存し、一方の失敗で他方を妨げないようにします。
function saveValue(key, value, itemName) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.warn(`${itemName}をlocalStorageに保存できませんでした。`, error);
    showMessage(`${itemName}を保存できませんでした。ブラウザーの保存領域を確認してください。`);
    return false;
  }
}

function saveCurrentState() {
  if (currentDisplayMode) {
    saveValue(STORAGE_KEYS.displayMode, currentDisplayMode, "表示方法");
  }
  const currentWord = words[currentIndex];
  if (currentWord) {
    saveValue(STORAGE_KEYS.wordId, currentWord.id, "学習位置");
    savedWordId = currentWord.id;
  }
}

// words.jsonを検証し、形式の誤りや重複IDを学習開始前に検出します。
function validateWordData(data) {
  if (!data || typeof data !== "object" || Array.isArray(data) ||
      !Array.isArray(data.words) || data.words.length === 0) {
    throw new Error('words.jsonは空でない「words」配列を含む必要があります。');
  }

  const ids = new Set();
  for (const [index, word] of data.words.entries()) {
    const validWord = word &&
      typeof word === "object" &&
      !Array.isArray(word) &&
      typeof word.id === "string" &&
      word.id.trim() !== "" &&
      typeof word.english === "string" &&
      word.english.trim() !== "" &&
      typeof word.pronunciation === "string" &&
      word.pronunciation.trim() !== "" &&
      typeof word.partOfSpeech === "string" &&
      word.partOfSpeech.trim() !== "" &&
      typeof word.translation === "string" &&
      word.translation.trim() !== "" &&
      typeof word.image === "string";

    if (!validWord) {
      throw new Error(`words.jsonの${index + 1}件目の形式が正しくありません。`);
    }
    if (ids.has(word.id)) {
      throw new Error(`words.jsonで固定ID「${word.id}」が重複しています。`);
    }
    ids.add(word.id);
  }
  return data.words;
}

// JSONファイルがまだない場合は開発用データを使い、読み込めたJSONの不正はエラーにします。
async function loadWords() {
  let response;
  try {
    response = await fetch("words.json");
  } catch (error) {
    console.info("words.jsonを読み込めないため、開発用の仮データを使用します。", error);
    return SAMPLE_WORDS;
  }

  if (!response.ok) {
    console.info(`words.jsonを読み込めませんでした（HTTP ${response.status}）。仮データを使用します。`);
    return SAMPLE_WORDS;
  }

  let data;
  try {
    data = await response.json();
  } catch (error) {
    throw new Error("words.jsonをJSONとして読み取れませんでした。", { cause: error });
  }
  return validateWordData(data);
}

function getSelectedDisplayMode() {
  return elements.displayModeInputs.find((input) => input.checked)?.value ?? null;
}

function setSelectedDisplayMode(mode) {
  for (const input of elements.displayModeInputs) {
    input.checked = input.value === mode;
  }
}

function showSettingsScreen() {
  elements.settingsScreen.hidden = false;
  elements.learningScreen.hidden = true;
}

function showLearningScreen() {
  elements.settingsScreen.hidden = true;
  elements.learningScreen.hidden = false;
}

// 現在の単語と選択した表示方法を各HTML要素へ反映します。
function renderCurrentWord() {
  const word = words[currentIndex];
  if (!word) {
    return;
  }

  elements.wordNumber.textContent = `単語 ${String(currentIndex + 1).padStart(3, "0")} / ${String(words.length).padStart(3, "0")}`;
  elements.englishWord.textContent = word.english;
  elements.wordPronunciation.textContent = word.pronunciation;
  elements.wordPartOfSpeech.textContent = `品詞：${word.partOfSpeech}`;
  elements.japaneseTranslation.textContent = word.translation;
  elements.translationArea.hidden =
    currentDisplayMode !== "translation" && currentDisplayMode !== "both";
  elements.imageArea.hidden = currentDisplayMode !== "image" && currentDisplayMode !== "both";

  elements.wordImage.hidden = true;
  elements.imagePlaceholder.hidden = true;
  elements.wordImage.removeAttribute("src");
  elements.wordImage.alt = `${word.english}の画像`;
  if (!word.image) {
    elements.imagePlaceholder.hidden = false;
  } else if (elements.imageArea.hidden) {
    elements.wordImage.hidden = true;
  } else {
    elements.wordImage.src = word.image;
    elements.wordImage.hidden = false;
  }

  elements.previousButton.disabled = currentIndex === 0;
  elements.nextButton.disabled = currentIndex === words.length - 1;
  updateSelectedNavigationWord();
}

// 品詞ごとの一覧を単語データの順番のままメニューに作成します。
function buildWordNavigation() {
  elements.wordNavigationMenu.replaceChildren();

  for (const category of PART_OF_SPEECH_CATEGORIES) {
    const categoryWords = words.filter((word) => word.partOfSpeech === category.value);
    const details = document.createElement("details");
    details.className = "word-navigation-category";

    const summary = document.createElement("summary");
    summary.textContent = category.label;
    details.append(summary);

    const list = document.createElement("ul");
    list.className = "word-navigation-list";
    if (categoryWords.length === 0) {
      const emptyItem = document.createElement("li");
      emptyItem.className = "word-navigation-empty";
      emptyItem.textContent = "単語がありません";
      list.append(emptyItem);
    } else {
      for (const word of categoryWords) {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.className = "word-navigation-item";
        button.type = "button";
        button.dataset.wordId = word.id;
        button.textContent = word.english;
        button.addEventListener("click", () => selectWordFromNavigation(word.id));
        item.append(button);
        list.append(item);
      }
    }

    details.append(list);
    elements.wordNavigationMenu.append(details);
  }
  updateSelectedNavigationWord();
}

function updateSelectedNavigationWord() {
  const currentWord = words[currentIndex];
  for (const button of elements.wordNavigationMenu.querySelectorAll("[data-word-id]")) {
    if (button.dataset.wordId === currentWord?.id) {
      button.setAttribute("aria-current", "true");
    } else {
      button.removeAttribute("aria-current");
    }
  }
}

function setWordNavigationOpen(isOpen) {
  elements.wordNavigationMenu.hidden = !isOpen;
  elements.wordMenuButton.setAttribute("aria-expanded", String(isOpen));
  elements.wordMenuButton.setAttribute(
    "aria-label",
    isOpen ? "品詞別の単語メニューを閉じる" : "品詞別の単語メニューを開く"
  );
}

function selectWordFromNavigation(wordId) {
  const selectedIndex = words.findIndex((word) => word.id === wordId);
  if (selectedIndex === -1) {
    console.error(`単語一覧で選択されたID「${wordId}」が見つかりません。`);
    showMessage("選択した単語を見つけられませんでした。");
    setWordNavigationOpen(false);
    return;
  }

  currentIndex = selectedIndex;
  renderCurrentWord();
  saveCurrentState();
  showMessage("");
  setWordNavigationOpen(false);
  elements.wordMenuButton.focus();
}

// JSONの読み込みが完了した後に保存された単語IDを復元します。
function restoreWordPosition() {
  const restoredIndex = words.findIndex((word) => word.id === savedWordId);
  if (savedWordId && restoredIndex === -1) {
    console.warn(`保存された単語ID「${savedWordId}」が見つからないため、先頭の単語から開始します。`);
    saveValue(STORAGE_KEYS.wordId, words[0].id, "学習位置");
    savedWordId = words[0].id;
  }
  currentIndex = restoredIndex >= 0 ? restoredIndex : 0;
}

function startLearning() {
  const selectedMode = getSelectedDisplayMode();
  if (!hasUsableWords || !selectedMode) {
    return;
  }
  showMessage("");
  currentDisplayMode = selectedMode;
  saveCurrentState();
  renderCurrentWord();
  showLearningScreen();
}

function moveWord(offset) {
  const nextIndex = currentIndex + offset;
  if (nextIndex < 0 || nextIndex >= words.length) {
    return;
  }
  showMessage("");
  currentIndex = nextIndex;
  renderCurrentWord();
  saveCurrentState();
}

function playCurrentWord() {
  if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
    showMessage("このブラウザーは音声読み上げに対応していません。");
    return;
  }

  const utterance = new SpeechSynthesisUtterance(words[currentIndex].english);
  utterance.lang = "en-US";
  const englishVoice = window.speechSynthesis.getVoices()
    .find((voice) => voice.lang.toLowerCase().startsWith("en"));
  if (englishVoice) {
    utterance.voice = englishVoice;
  }
  utterance.onerror = (event) => {
    console.warn("英単語の音声を再生できませんでした。", event.error);
    showMessage("音声を再生できませんでした。ブラウザーの音声設定をご確認ください。");
  };
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
  showMessage("");
}

function disableLearningControls() {
  elements.startButton.disabled = true;
  elements.wordMenuButton.disabled = true;
  elements.previousButton.disabled = true;
  elements.nextButton.disabled = true;
  elements.playAudioButton.disabled = true;
  elements.openSettingsButton.disabled = true;
  for (const input of elements.displayModeInputs) {
    input.disabled = true;
  }
}

// HTMLの操作部品にイベントを設定します。
elements.startButton.addEventListener("click", startLearning);
elements.wordMenuButton.addEventListener("click", () => {
  setWordNavigationOpen(elements.wordNavigationMenu.hidden);
});
elements.previousButton.addEventListener("click", () => moveWord(-1));
elements.nextButton.addEventListener("click", () => moveWord(1));
elements.playAudioButton.addEventListener("click", playCurrentWord);
elements.openSettingsButton.addEventListener("click", () => {
  if (!hasUsableWords) {
    return;
  }
  setSelectedDisplayMode(currentDisplayMode);
  showSettingsScreen();
});
for (const input of elements.displayModeInputs) {
  input.addEventListener("change", () => {
    if (!hasUsableWords) {
      return;
    }
    showMessage("");
    currentDisplayMode = getSelectedDisplayMode();
    saveCurrentState();
  });
}

elements.wordImage.addEventListener("error", () => {
  elements.wordImage.hidden = true;
  elements.imagePlaceholder.hidden = false;
  console.warn(`画像を読み込めませんでした: ${elements.wordImage.getAttribute("src")}`);
});

// 起動時に保存状態と単語データを読み込み、最初に表示する画面を決めます。
async function initializeApp() {
  readSavedState();
  try {
    words = await loadWords();
    hasUsableWords = true;
  } catch (error) {
    console.error("単語データを利用できません。words.jsonを確認してください。", error);
    showMessage(`単語データを読み込めませんでした。${error.message} 操作は無効になっています。`);
    disableLearningControls();
    return;
  }

  buildWordNavigation();
  restoreWordPosition();
  if (currentDisplayMode) {
    setSelectedDisplayMode(currentDisplayMode);
    renderCurrentWord();
    showLearningScreen();
  } else {
    showSettingsScreen();
  }
}

initializeApp();
