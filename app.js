const express = require("express");
const axios = require("axios");
const { Client } = require("@notionhq/client");

const app = express();
app.use(express.json());

const notion = new Client({ auth: "secret_mGHc8wQ6V7NVZ0eRzIF9km0UKLupyzPEgNVnn7yz0uz" });

function roundAndRemoveNegative(value) {
  if (isNaN(value)) throw new Error("Invalid number");
  return Math.round(Math.abs(value) / 100);
}

function convertTimestampToISO(timestamp) {
  return new Date(timestamp * 1000).toISOString();
}

async function getCurrentLinkOfMonth() {
  const myPage = await notion.databases.query({
    database_id: "67857db90ccc4aa79e19815b2a1ab111",
  });

  const currentMonth = new Date().toLocaleString("uk-UA", { month: "long" });
  const foundMonth = myPage.results.find(
    (item) => item.properties.Month.title[0].text.content === currentMonth
  )?.url;

  return foundMonth ? foundMonth.split("/")[3] : null;
}

async function postNewCheckMonoBank(area, amount, note, card, id, date) {
  const linkMonth = await getCurrentLinkOfMonth();
  return notion.pages.create({
    icon: { type: "external", external: { url: area === "Дохід" ? "https://www.notion.so/icons/arrow-up-basic_green.svg" : "https://www.notion.so/icons/arrow-down-basic_red.svg" } },
    parent: { database_id: "eb90ede7155a4c5697758bc3b563ba7b" },
    properties: {
      Amount: { title: [{ text: { content: "₴" + amount } }] },
      Categories: { select: { name: "MonoBank" } },
      Area: { select: { name: area } },
      Notes: { rich_text: [{ text: { content: note } }] },
      "Create Time MonoBank": { date: { start: date } },
      ID: { rich_text: [{ text: { content: id } }] },
      Card: { select: { name: card } },
      Month: { relation: linkMonth ? [{ id: linkMonth }] : [] },
    },
  });
}

app.post("/api/syncMonoBank", async function (req, res) {
  if (!req.body) return res.status(400).send("Bad request: No body provided");

  const xToken = req.body.api;
  const id_cards = ["i6cWTK5hVISHvp46fbr_Lg", "biyChSHTk1jAMkBnM06R_g"];

  try {
    // Зменшуємо діапазон до 3 днів
    const to = Math.floor(Date.now() / 1000);
    const from = Math.floor(Date.now() / 1000) - 3 * 24 * 60 * 60;
    
    const requests = id_cards.map(id_card =>
      axios.get(`https://api.monobank.ua/personal/statement/${id_card}/${from}/${to}`, {
        headers: { "X-Token": xToken },
        timeout: 5000, // Додаємо таймаут
      }).then(response => response.data.map(item => ({ ...item, card: id_card })))
        .catch(error => {
          console.error(`Error fetching data for ${id_card}:`, error.message);
          return [];
        })
    );

    // Використовуємо Promise.allSettled(), щоб уникнути падіння всієї операції
    const results = await Promise.allSettled(requests);
    const allData = results.flatMap(result => result.status === "fulfilled" ? result.value : []);

    // Відсортовуємо дані за часом
    const sortedData = allData.sort((a, b) => a.time - b.time);

    // Отримуємо транзакції за останні 10 днів із Notion
    const formattedDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const notionPage = await notion.databases.query({
      database_id: "eb90ede7155a4c5697758bc3b563ba7b",
      filter: { property: "Created time", created_time: { on_or_after: formattedDate } }
    });

    const billingNotionIds = new Set(notionPage.results.map(item => item.properties.ID?.rich_text[0]?.text.content || ""));

    // Обробляємо нові транзакції
    const processItems = sortedData.map(async (item) => {
      if (billingNotionIds.has(item.id)) return false;

      const card = item.card === id_cards[0] ? "Mono Black" : "Mono White";
      const amount = roundAndRemoveNegative(item.amount) + roundAndRemoveNegative(item.cashbackAmount);
      const area = item.amount < 0 ? "Витрата" : "Дохід";
      const note = item.description + (item.comment ? `\n${item.comment}` : "");
      const date = convertTimestampToISO(item.time);

      await postNewCheckMonoBank(area, amount, note, card, item.id, date);
      return true;
    });

    const responses = await Promise.allSettled(processItems);
    const countTrue = responses.filter(r => r.status === "fulfilled" && r.value).length;

    res.status(200).send(`Sync transactions - ${countTrue}`);
  } catch (error) {
    console.error("Error processing request:", error);
    res.status(500).send(`Internal server error: ${error.message}`);
  }
});

app.listen(3000, () => console.log("Сервер очікує підключення..."));

module.exports = app;
