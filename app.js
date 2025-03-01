const express = require("express");
const axios = require("axios");
const { Client } = require("@notionhq/client");

const app = express();
app.use(express.json());
app.use(express.static("public"));

const notion = new Client({ auth: "secret_mGHc8wQ6V7NVZ0eRzIF9km0UKLupyzPEgNVnn7yz0uz" });
const urkMonth = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];

const roundAndRemoveNegative = (value) => Math.round(Math.abs(value) / 100);
const convertTimestampToISO = (timestamp) => new Date(timestamp * 1000).toISOString();
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getCurrentLinkOfMonth() {
  const { results } = await notion.databases.query({ database_id: "67857db90ccc4aa79e19815b2a1ab111" });
  const currentMonth = urkMonth[new Date().getMonth()];
  return results.find((item) => item.properties.Month.title[0].text.content === currentMonth)?.url.split("/")[3];
}

async function getAllCategories() {
  const { properties } = await notion.databases.retrieve({ database_id: "eb90ede7155a4c5697758bc3b563ba7b" });
  return properties.Categories.select.options.map((item) => item.name);
}

async function getBalance() {
  const { results } = await notion.databases.query({ database_id: "67857db90ccc4aa79e19815b2a1ab111" });
  return results.reduce((sum, item) => sum + item.properties.Balance.formula.number, 0);
}

async function postNewCheck(area, amount, category, note) {
  const linkMonth = await getCurrentLinkOfMonth();
  return notion.pages.create({
    parent: { database_id: "eb90ede7155a4c5697758bc3b563ba7b" },
    icon: { type: "external", external: { url: area === "Дохід" ? "https://www.notion.so/icons/arrow-up-basic_green.svg" : "https://www.notion.so/icons/arrow-down-basic_red.svg" } },
    properties: {
      Amount: { title: [{ text: { content: `₴${amount}` } }] },
      Categories: { select: { name: category } },
      Area: { select: { name: area } },
      Notes: { rich_text: [{ text: { content: note } }] },
      Month: { relation: [{ id: linkMonth }] },
    },
  });
}

async function syncMonoBank(req, res) {
  try {
    const { api: xToken } = req.body;
    if (!xToken) return res.status(400).send("Missing API token");

    const id_cards = ['i6cWTK5hVISHvp46fbr_Lg', 'biyChSHTk1jAMkBnM06R_g'];
    const from = Math.floor(Date.now() / 1000) - 5 * 24 * 60 * 60;
    const to = Math.floor(Date.now() / 1000);

    const responses = await Promise.all(
      id_cards.map(async (id_card) => {
        const { data } = await axios.get(`https://api.monobank.ua/personal/statement/${id_card}/${from}/${to}`, { headers: { "X-Token": xToken } });
        return data.map((item) => ({ ...item, card: id_card }));
      })
    );

    const sortedData = responses.flat().sort((a, b) => a.time - b.time);
    const formattedDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    const { results } = await notion.databases.query({ database_id: "eb90ede7155a4c5697758bc3b563ba7b", filter: { property: "Created time", created_time: { on_or_after: formattedDate } } });
    const billingNotionIds = new Set(results.map((item) => item.properties.ID.rich_text[0]?.text.content));

    const newTransactions = sortedData.filter(({ id }) => !billingNotionIds.has(id));
    await Promise.all(
      newTransactions.map(({ amount, cashbackAmount, description, comment, id, card, time }) =>
        postNewCheck(amount < 0 ? "Витрата" : "Дохід", roundAndRemoveNegative(amount) + roundAndRemoveNegative(cashbackAmount), "MonoBank", `${description}${comment ? `\n${comment}` : ""}`, card === id_cards[0] ? "Mono Black" : "Mono White", id, convertTimestampToISO(time))
      )
    );

    res.status(200).send(`Sync transactions - ${newTransactions.length}`);
  } catch (error) {
    console.error("Error syncing transactions:", error);
    res.status(500).send(`Internal server error: ${error.message}`);
  }
}

// Routes
app.get("/", (req, res) => res.send("Hey this is my API running 🥳"));
app.get("/api/categories", async (req, res) => res.send(await getAllCategories()));
app.get("/api/balance", async (req, res) => res.send(`${await getBalance()}`));
app.post("/api/users", async (req, res) => res.send(await postNewCheck(req.body.area, req.body.amount, req.body.category, req.body.note)));
app.post("/api/syncMonoBank", syncMonoBank);

app.listen(3000, () => console.log("Сервер ожидает подключения..."));
module.exports = app;