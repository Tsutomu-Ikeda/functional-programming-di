# DI Project

[![CI](https://github.com/username/di/actions/workflows/ci.yml/badge.svg)](https://github.com/username/di/actions/workflows/ci.yml)
[![Code Coverage](https://github.com/username/di/actions/workflows/coverage.yml/badge.svg)](https://github.com/username/di/actions/workflows/coverage.yml)
[![Security Audit](https://github.com/username/di/actions/workflows/security.yml/badge.svg)](https://github.com/username/di/actions/workflows/security.yml)

TypeScriptプロジェクトでDependency Injectionパターンを実装したサンプルアプリケーションです。

## 🚀 機能

- Clean Architecture
- Domain-Driven Design
- Functional Programming (fp-ts)
- 包括的なテストカバレッジ
- ESLintによる静的解析
- GitHub Actionsによる自動CI/CD

## 📦 技術スタック

- **言語**: TypeScript
- **テスト**: Jest
- **関数型プログラミング**: fp-ts
- **リンター**: ESLint
- **パッケージマネージャー**: pnpm

## 🛠️ セットアップ

```bash
# 依存関係のインストール
pnpm install

# テスト実行
pnpm test

# テスト（ウォッチモード）
pnpm test:watch

# カバレッジ付きテスト
pnpm test:coverage

# ESLintチェック
pnpm lint

# ESLint自動修正
pnpm lint:fix

# チェックファイル数表示
pnpm lint:count
```

## 🔧 GitHub Actions

このプロジェクトでは以下のワークフローが自動実行されます：

### CI (`ci.yml`)
- Node.js 18.x, 20.x でのマトリックステスト
- ESLintチェック
- Jestテスト実行
- pnpmキャッシュ最適化

### ESLint PR Review (`lint-pr.yml`)
- Pull Requestでのコード品質チェック
- ESLint結果のアノテーション
- 結果のアーティファクト保存

### Code Coverage (`coverage.yml`)
- テストカバレッジ測定
- Codecovへのレポート送信
- PRへのカバレッジコメント

### Security Audit (`security.yml`)
- 依存関係の脆弱性チェック
- 毎日自動実行（UTC 2:00）
- Pull Requestでの依存関係レビュー

## 📁 プロジェクト構造

```
src/
├── application/          # アプリケーション層
│   ├── ports.ts         # ポート（インターフェース）
│   └── usecases/        # ユースケース
├── domain/              # ドメイン層
│   ├── user.ts          # ユーザーエンティティ
│   ├── userFactory.ts   # ユーザーファクトリー
│   └── errors.ts        # ドメインエラー
└── shared/              # 共通ユーティリティ
    └── validation.ts    # バリデーション
```

## 🧪 テスト

- 単体テスト: Jest
- カバレッジ: 自動測定・レポート
- CI/CD: GitHub Actionsで自動実行

## 📋 コード品質

- **ESLint**: TypeScript推奨ルール + カスタムルール
- **末尾スペース**: 自動検出・修正
- **改行**: ファイル末尾改行の強制
- **未使用変数**: インターフェースパラメータは除外

## 🤝 コントリビューション

1. このリポジトリをフォーク
2. フィーチャーブランチを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'Add some amazing feature'`)
4. ブランチにプッシュ (`git push origin feature/amazing-feature`)
5. Pull Requestを作成

## 📄 ライセンス

このプロジェクトはISCライセンスの下で公開されています。
