# 00981A 持股異動研究台

這是一個本機研究用 App，用來每天查看 00981A 的持股變化，包含新增、加碼、減碼、刪除、持股比例、張數與過去幾個交易日的變化。

## 啟動

```bash
npm start
```

開啟：

```text
http://localhost:4173
```

## 部署到 Render

這個專案現在已經補好 `render.yaml`，最省事的上線方式是用 Render 部署成 Node Web Service。

1. 把這個資料夾推到 GitHub
2. 到 Render 建立新服務，選 `Blueprint` 或 `Web Service`
3. 連上你的 GitHub repo
4. 如果你走 `Blueprint`，Render 會直接讀根目錄的 `render.yaml`
5. 如果你走手動建立 `Web Service`，填：

```text
Runtime: Node
Build Command: npm install
Start Command: npm start
Health Check Path: /api/health
Region: Singapore
```

部署完成後，你會拿到一個公開網址，像是：

```text
https://00981a-dashboard.onrender.com
```

### 重要說明

- 這個 App 上線後會在使用者打開頁面時即時抓最新 00981A 公開資料，所以不是只能看本機資料
- 你之前設定的本機每日排程是「本機快照備份」，不會自動同步到雲端主機
- 如果你想要雲端也每天固定留檔備份，之後可以再加 Render 的 cron job 或改接資料庫 / object storage

## 部署到 GitHub Pages

這是最適合公開免登入的版本。把專案推到 GitHub 的 `main` 分支後，GitHub Actions 會部署 `public` 資料夾，並且每天台北時間晚上 8 點重新匯出資料再部署。

GitHub repo 需要到 Settings -> Pages，把 Source 設成 GitHub Actions。

部署完成後會得到公開網址，例如：

```text
https://你的帳號.github.io/你的repo名稱/
```

## 手動更新本機快照

```bash
npm run update:data
```

更新後會寫入：

```text
data/latest.json
data/snapshots/00981A-YYYY-MM-DD.json
```

## 資料來源

- 每日持股異動：`https://zdsetf.com/etf/00981A`
- 官方 ETF 基本資料可至證交所 ETF e 添富查詢：`https://www.twse.com.tw/zh/ETFortune/etfInfo/00981A`

這個 App 是研究工具，不構成投資建議。持股異動與權重變化是依公開頁面資料整理與相鄰快照推算，實際資料請以發行投信與證交所公告為準。
