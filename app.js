const express = require("express");
const axios = require('axios');
const fs = require('fs');
const date = new Date();
const { Client } = require("@notionhq/client");

const app = express();
app.use(express.json());



app.use(express.static("public"));

const notion = new Client({
  auth: "secret_mGHc8wQ6V7NVZ0eRzIF9km0UKLupyzPEgNVnn7yz0uz",
});

const urkMonth = [
  "Січень",
  "Лютий",
  "Березень",
  "Квітень",
  "Травень",
  "Червень",
  "Липень",
  "Серпень",
  "Вересень",
  "Жовтень",
  "Листопад",
  "Грудень",
];

function roundAndRemoveNegative(value) {
  // Переконатися, що число є дійсним
  if (isNaN(value)) {
    throw new Error('Invalid number');
  }

  // Прибираємо від'ємність і обробляємо число як позитивне
  const absoluteValue = Math.abs(value);

  // Відокремлюємо копійки (дві останні цифри) і основну частину числа
  const integerPart = Math.floor(absoluteValue / 100);
  const fractionalPart = absoluteValue % 100;

  // Заокруглюємо основну частину до найближчого цілого числа
  const roundedIntegerPart = Math.round(integerPart + fractionalPart / 100);

  return roundedIntegerPart;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function convertTimestampToISO(timestamp) {
  // Перетворюємо timestamp в мілісекунди (якщо він в секундах)
  const date = new Date(timestamp * 1000);
  
  // Отримуємо рядок у форматі ISO 8601
  return date.toISOString();
}

async function getCurrentLinkOfMonth() {
  const myPage = await notion.databases.query({
    database_id: "67857db90ccc4aa79e19815b2a1ab111",
  });

  const test = myPage.results.map((item) => {
    const allMonth = item.properties.Month.title[0].text.content;
    const allMonthLink = item.url;

    return {
      name: allMonth,
      link: allMonthLink,
    };
  });

  const currentMonth = urkMonth[date.getMonth()];

  const foundMonth = test.find((month) => month.name === currentMonth).link;
  const rewLink = foundMonth.split("/")[3];

  return rewLink;
}

async function getAllCaregories() {
  const myPage = await notion.databases.retrieve({
    database_id: "eb90ede7155a4c5697758bc3b563ba7b",
  });
  const res = myPage.properties.Categories.select.options.map(
    (item) => item.name
  );

  return res;
}

async function getBalance() {
  const myPage = await notion.databases.query({
    database_id: "67857db90ccc4aa79e19815b2a1ab111",
  });
  const myBalance = myPage.results.reduce((count, item) => {
    const test = item.properties.Balance.formula.number;
    return (count += test);
  }, 0);

  return myBalance;
}

async function postNewCheck(area, amount, category, note) {
  const linkMonth = await getCurrentLinkOfMonth();
  const myPage = await notion.pages.create({
    icon: {
      type: "external",
      external: {
        url:
          area === "Дохід"
            ? "https://www.notion.so/icons/arrow-up-basic_green.svg"
            : "https://www.notion.so/icons/arrow-down-basic_red.svg",
      },
    },
    parent: {
      type: "database_id",
      database_id: "eb90ede7155a4c5697758bc3b563ba7b",
    },
    properties: {
      Amount: {
        title: [
          {
            text: {
              content: "₴" + amount,
            },
          },
        ],
      },
      Categories: {
        select: {
          name: category,
        },
      },
      Area: {
        select: {
          name: area,
        },
      },
      Notes: {
        rich_text: [
          {
            text: {
              content: note,
            },
          },
        ],
      },
      Month: {
        relation: [
          {
            id: linkMonth,
          },
        ],
      },
    },
  });

  //   return res;
}

async function postNewCheckMonoBank(area, amount, note, card, id, date) {
  const linkMonth = await getCurrentLinkOfMonth();
  const myPage = await notion.pages.create({
    icon: {
      type: "external",
      external: {
        url:
          area === "Дохід"
            ? "https://www.notion.so/icons/arrow-up-basic_green.svg"
            : "https://www.notion.so/icons/arrow-down-basic_red.svg",
      },
    },
    parent: {
      type: "database_id",
      database_id: "eb90ede7155a4c5697758bc3b563ba7b",
    },
    properties: {
      Amount: {
        title: [
          {
            text: {
              content: "₴" + amount,
            },
          },
        ],
      },
      Categories: {
        select: {
          name: "MonoBank",
        },
      },
      Area: {
        select: {
          name: area,
        },
      },
      Notes: {
        rich_text: [
          {
            text: {
              content: note,
            },
          },
        ],
      },
      "Create Time MonoBank": {
        date: {
          start: date
        }
      },
      ID: {
        rich_text: [
          {
            text: {
              content: id,
            },
          },
        ],
      },
      Card: {
        select: {
          name: card,
        },
      },
      Month: {
        relation: [
          {
            id: linkMonth,
          },
        ],
      },
    },
  });

  return true;
}

// Запити --------------------------------------------------------------

app.get("/", (req, res) => {
  res.send("Hey this is my API running 🥳");
});

app.get("/api/categories", async function (req, res) {
  const categories = await getAllCaregories();
  res.send(categories);
});

app.get("/api/balance", async function (req, res) {
  const balance = await getBalance();
  res.send(`${balance}`);
});

app.post("/api/users", async function (req, res) {
  if (!req.body) return res.sendStatus(400);

  const amount = req.body.amount;
  const category = req.body.category;
  const area = req.body.area;
  const note = req.body.note;

  const resp = await postNewCheck(area, amount, category, note);

  res.send(resp);
});

app.post("/api/syncMonoBank", async function (req, res) {
  if (!req.body) return res.status(400).send("Bad request: No body provided");

  const xToken = req.body.api;
  const id_black = 'i6cWTK5hVISHvp46fbr_Lg';
  const id_white = 'biyChSHTk1jAMkBnM06R_g';

  const id_cards = [id_black, id_white];

  try {
    // Отримання результатів для кожної картки
    const results = await Promise.all(id_cards.map(async (id_card) => {
      const to = Math.floor(Date.now() / 1000);
      const from = Date.now() - (10 * 24 * 60 * 60 * 1000);
      const url = `https://api.monobank.ua/personal/statement/${id_card}/${from}/${to}`;
  
      const response = await axios.get(url, { headers: { 'X-Token': xToken } });
      return response.data.map(item => ({ ...item, card: id_card }));
    }));

    // Об'єднуємо всі результати в один масив
    const allData = results.flat();

    // Відсортувати об'єкти за timestamp
    const sortedData = allData.sort((a, b) => a.time - b.time);
    console.log(sortedData)

    // Ваша подальша обробка даних
    const today = new Date();
    const pastDate = new Date(today);
    pastDate.setDate(today.getDate() - 10);
    const formattedDate = pastDate.toISOString().split('T')[0];
  
    const myPage = await notion.databases.query({
      database_id: "eb90ede7155a4c5697758bc3b563ba7b",
      filter: {
        property: "Created time",
        created_time: { on_or_after: formattedDate }
      }
    });
  
    const billing_notion_ids = myPage.results.map(item => item.properties.ID.rich_text[0]?.text.content || '');
  
    const processItems = sortedData.map(async (item) => {
      const card = id_black === item.card ? 'Mono Black' : 'Mono White';
      
      if (billing_notion_ids.includes(item.id)) {
        console.log(`Item ID ${item.id} exists in Notion`);
        return false;
      } else {
        const amount = roundAndRemoveNegative(item.amount) + roundAndRemoveNegative(item.cashbackAmount);
        const area = item.amount < 0 ? 'Витрата' : 'Дохід';
        const note = `${item.description}${item.comment ? `\n${item.comment}` : ''}`;
        const id = item.id;
        const date = convertTimestampToISO(item.time);

        const resp = await postNewCheckMonoBank(area, amount, note, card, id, date);
        console.log(`Posted new check for ID ${item.id}`);

        return true;
      }
    });

    const responses = await Promise.all(processItems);
    const countTrue = responses.filter(value => value === true).length;
    res.status(200).send(`Синхронізованих транзакцій - ${countTrue}`);

  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).send(`Internal server error: ${error.message}`);
  }
});

// Запити ---------------------------------------------------------------------------

app.listen(3000, function () {
  console.log("Сервер ожидает подключения...");
});

module.exports = app;