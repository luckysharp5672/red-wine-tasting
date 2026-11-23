// GAS をデプロイしたら、ウェブアプリの URL（https://script.google.com/macros/s/……/exec）をここに入れる。
// 空のままだと「模擬モード」（このブラウザの中だけで動く確認用）になる。
window.APP_CONFIG = {
  API_URL:
    "https://script.google.com/macros/s/AKfycby72ZJs6PumRkheukp0Y0tKKYYsT0NQEkbGIMRdIHYhBodOXcRdyJA7CHCfJtcINYKv/exec",
  // QRに載せる参加者用URL。空なら、いま開いているページのURL（?host を外したもの）を使う
  PUBLIC_URL: "",
};
