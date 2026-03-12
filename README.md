# Dutch Practice

Приложение для практики нидерландской грамматики (A1-A2).

## Структура

```
dutch-practice/
├── api/
│   └── generate.js     # Vercel Function — проксирует запросы к Anthropic
├── public/
│   └── index.html      # Фронтенд
└── vercel.json
```

## Деплой на Vercel

### 1. Залей на GitHub

```bash
git init
git add .
git commit -m "init"
git remote add origin https://github.com/ТВО_ИМЯ/dutch-practice.git
git push -u origin main
```

### 2. Подключи к Vercel

- Зайди на [vercel.com](https://vercel.com) → New Project
- Импортируй репозиторий с GitHub
- Нажми Deploy

### 3. Добавь API ключ

В Vercel → Settings → Environment Variables:

```
ANTHROPIC_API_KEY = sk-ant-...
```

Ключ получишь на [console.anthropic.com](https://console.anthropic.com) → API Keys.

После добавления переменной нажми **Redeploy**.

## Локальная разработка

```bash
npm i -g vercel
vercel dev
```

Создай файл `.env.local`:
```
ANTHROPIC_API_KEY=sk-ant-...
```
