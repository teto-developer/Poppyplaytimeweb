# Poppy Playtime Web 3D Prototype

Poppy Playtime の雰囲気を参考にした、ブラウザ向け 3D プロトタイプです。

## できること
- PC操作: WASD + マウス視点、Shift ダッシュ、Space ジャンプ、E/ダブルクリックで Grab
- モバイル操作: 左仮想スティック移動、右仮想スティック視点、Jump/Grab ボタン
- Map Editor: オブジェクトの追加・削除・保存・JSONエクスポート/インポート

## 起動方法
```bash
python3 -m http.server 4173
```

ブラウザで `http://localhost:4173` を開いてください。

## マップ編集
1. 右側（モバイルでは下側）の `Map Editor` で `Type / Size / Height` を設定
2. `Add in front` でプレイヤー前方に配置
3. `Remove target` で中央照準のタイルを削除
4. `Save` でローカル保存（`localStorage`）
5. `Export` で JSON 生成、`Import` で JSON から再構築

## 参考
- https://github.com/tayoky/Poppy-Playtime-Unity
- https://github.com/DetectivePikaC2/Grabpack-In-Godot
