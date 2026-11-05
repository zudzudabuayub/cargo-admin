# API для приложения клиентов

Мобильное приложение (iOS / Android / Flutter / React Native / PWA) работает с тем же сервером, что и админка. Все сообщения клиента попадают в раздел «Чаты», а изменения статусов посылок — в приложение в реальном времени.

База: `https://<ваш-домен>/api`. Формат — JSON. Авторизованные запросы передают заголовок:

```
Authorization: Bearer <token>
```

## Вход по номеру телефона

### 1. Запросить код

`POST /client/auth/request-code`

```json
{ "phone": "+992 93 777 11 22" }
```

Ответ:

```json
{ "sent": true, "phone": "+992 93 777 11 22", "registered": false, "devCode": "7996" }
```

`devCode` возвращается только в режиме разработки. В продакшене код отправляется по SMS — подключите провайдера в `server/routes/client.ts`. Код живёт 5 минут, 5 попыток.

### 2. Подтвердить код

`POST /client/auth/verify`

```json
{ "phone": "+992937771122", "code": "7996" }
```

- Клиент найден → `{ "token": "...", "client": { "id", "code", "name", "phone" } }`
- Новый номер → `404 { "error": "needs_registration" }`. Повторите запрос с именем и пунктом выдачи:

```json
{ "phone": "+992937771122", "code": "7996", "name": "Рустам Назаров", "warehouseId": 5 }
```

Клиенту создаётся код (`DSH-1459`, `KHJ-…`, `KLB-…`, `BKT-…`), админка получает уведомление «Новый клиент из приложения».

`POST /client/auth/logout` — завершить сессию.

## Профиль

`GET /client/me` — профиль, код клиента, баланс (`< 0` — долг), счётчики посылок по статусам и **адреса складов в Китае** для заказов на Taobao, 1688, Pinduoduo:

```json
{
  "code": "DSH-1459",
  "balance": 0,
  "warehouseName": "Склад Душанбе",
  "chinaAddresses": [
    {
      "warehouse": "Склад Гуанчжоу",
      "receiver": "阿里 DSH-1459",
      "phone": "+86 138 0013 8821",
      "addressLocal": "广东省广州市白云区石井街道庆丰路88号3号仓 (DSH-1459)",
      "zip": "510430",
      "copyText": "收货人: 阿里 DSH-1459\n电话: …"
    }
  ]
}
```

`PATCH /client/me` — `name`, `email`, `telegram`, `address`, `phone2`, `warehouseId`.

## Посылки

| Метод | Путь | Описание |
|---|---|---|
| GET | `/client/parcels?status=in_transit` | Мои посылки (фильтр по статусу необязателен) |
| GET | `/client/parcels/:id` | Посылка, история статусов и положение рейса на маршруте |
| POST | `/client/parcels` | Добавить трек-номер заказа: `{ "trackNumber": "YT…", "description": "Кроссовки" }` |
| DELETE | `/client/parcels/:id` | Удалить (только в статусе «Ожидается») |

Когда склад в Китае сканирует этот трек-номер, посылка автоматически привязывается к клиенту, и в чат приходит сообщение с весом и стоимостью доставки. Если посылка уже лежит на складе «без кода», `POST /client/parcels` привяжет её к клиенту (`"matched": true`).

Статусы: `expected` — ожидается, `received` — на складе в Китае, `in_transit` — в пути, `customs` — таможня, `arrived` — готов к выдаче, `delivered` — выдан, `problem` — проблема.

## Тарифы и калькулятор (без входа)

- `GET /client/tariffs`
- `POST /client/calculate` — `{ "tariffId": 1, "weightKg": 10, "lengthCm": 60, "widthCm": 40, "heightCm": 40 }` → `{ total, tjs, chargedBy: "weight" | "volume", days: [14, 20] }`
- `GET /client/warehouses` — склады Китая и пункты выдачи в Таджикистане с адресами, телефонами и режимом работы.

## Чат с поддержкой

- `GET /client/chat` — история переписки (`senderType`: `client`, `admin`, `system` — автоуведомления)
- `POST /client/chat/messages` — `{ "text": "Когда придёт мой заказ?" }`

## Real-time

`GET /client/stream?token=<token>` — поток Server-Sent Events. Событие `message` приходит, когда оператор отвечает или система отправляет уведомление (посылка принята, рейс отправлен, прибыла, задержка, оплата получена).

```js
const es = new EventSource(`${API}/client/stream?token=${token}`);
es.addEventListener('message', (e) => showMessage(JSON.parse(e.data)));
```

Для push-уведомлений на телефон добавьте отправку через FCM/APNs там же, где вызывается `messageClient` (`server/domain.ts`).

## Платежи

`GET /client/payments` — история оплат клиента.

## Публичный трекинг (без входа)

`GET /public/track/<трек-номер | код ссылки>` — статус посылки и положение рейса на карте. Веб-версия: `https://<домен>/t/<трек-номер>`.
