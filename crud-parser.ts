import "dotenv/config"
import { Command, CommanderError } from "commander";
import postgres from "postgres";
import { z } from "zod";


// auxilliary functions
function processZodError(result: z.ZodSafeParseResult<unknown>, json: boolean): void {
    if (result.success) {
        return;
    }
    
    let issues: string[] = [];
    for (const issue of result.error.issues) {
        issues.push(`${issue.path.join(".")}: ${issue.message}`);
    }

    if (json) {
        let jsonDict = {
            ok: false,
            issues: issues
        }
        console.error(JSON.stringify(jsonDict, null, 2));
    }
    else {
        console.error(issues.join("\n"));
    }

    shutdown();
}

function shutdown(): void {
    sql.end();
    process.exit(1);
}

function printEmptyError(errorMsg: string, json: boolean): void {
    if (json) {
        let jsonDict = {
            ok: false,
            error: errorMsg
        }
        console.error(JSON.stringify(jsonDict, null, 2));
    }
    else {
        console.error(errorMsg);
    }

    shutdown();
}

// initialize postgres client
if (!process.env.DATABASE_URL) {
    console.error("Missing Database URL");
    process.exit(1)
}

const sql = postgres(process.env.DATABASE_URL!, { max: 1 })

// Define the schema for a task
const NewSchema = z.object({
    title: z.string().trim().min(1),
    priority: z.enum(["low", "medium", "high"]).default("medium"),
    dueDate: z.coerce.date().optional(),
});

const ListSchema = z.object({
    filter: z.enum(["all", "pending", "done"]).default("all"),
});

const DoneSchema = z.object({
    id: z.coerce.bigint().positive(),
});

const DeleteSchema = z.object({
    id: z.coerce.bigint().positive(),
});

// create a new command
const program = new Command();

// define top level options
program
    .option("--json", "Output the result in JSON format", false);

// define some commands
// --new - adds a new todo item
program
    .command("new")
    .description("Adds a new todo item")
    .option("-t, --title <title>", "The title of the task")
    .option("-p, --priority <priority>", "The priority of the task")
    .option("-d, --dueDate <dueDate>", "The due date of the task")
    .action(async (options, cmd) => {
        // Parse arguments
        const { title, priority, dueDate } = options;
        const { json } = cmd.optsWithGlobals();
        const result = NewSchema.safeParse({ title, priority, dueDate });

        if (!result.success) {
            processZodError(result, json);
            return;
        }

        const task = result.data;

        // INSERT using PostgreSQL
        type TodoRow = {
            id: number;
            title: string;
            priority: string;
            due_date: Date | null;
            done: boolean;
            created_at: Date;
        };

        let row: TodoRow | undefined;
        
        try {
            const inserted = await sql `
                INSERT INTO todos (title, priority, due_date)
                VALUES (${task.title}, ${task.priority}, ${task.dueDate ?? null})
                RETURNING id, title, priority, due_date, done, created_at
            `
            row = inserted[0] as TodoRow;

        } catch (error) {
            console.error(error);
            shutdown();
            return;
        }

        // Output result
        if (!row) {
            printEmptyError("Row is empty", json);
            return;
        }

        if (json) {
            let jsonDict = {
                ok: true,
                todo: row
            }
            console.log(JSON.stringify(jsonDict, null, 2));
            return;
        }

        let outputStr = `Adding task #${row.id}: ${row.title} with priority ${row.priority}`;
        if (row.due_date) {
            outputStr += ` and due date ${row.due_date.toLocaleDateString("en-CA")}`;
        }

        console.log(outputStr);
        
    });

// --list [all|pending|done] - lists todo items
program
    .command("list")
    .description("Lists todo items")
    .option("-f, --filter <filter>", "Filter between all, pending, or done")
    .action(async (options, cmd) => {
        // Parse arguments
        const { filter } = options;
        const { json } = cmd.optsWithGlobals();
        const result = ListSchema.safeParse({ filter });

        if (!result.success) {
            processZodError(result, json);
            return;
        }

        const task = result.data;
        const filterOption = task.filter ? task.filter : "all";

        // UPDATE with PostgreSQL
        let contents;
        try {
            let where_clause = sql``
            switch (filterOption) {
                case "pending":
                    where_clause = sql`WHERE done = false`
                    break;
                case "done":
                    where_clause = sql`WHERE done = true`
                    break;
                default:
                    break;
            }
            contents = await sql `
                SELECT * FROM todos
                ${where_clause}
                ORDER BY id
            `

        } catch (error) {
            console.error(error);
            shutdown();
            return;
        }

        // Output result
        if (json) {
            let jsonDict = {
                ok: true,
                todo: contents
            }
            console.log(JSON.stringify(jsonDict, null, 2));
            return;
        }

        for (const row of contents!) {
            console.log(row)
        }
        
    });

// --done [id] - updates a todo item to done
program
    .command("done <id>")
    .description("Marks a todo item to done")
    .action(async (id: string, options, cmd) => {
        // Parse arguments
        const { json } = cmd.optsWithGlobals();
        const result = DoneSchema.safeParse({ id });

        if (!result.success) {
            processZodError(result, json);
            return;
        }

        const task = result.data;

        // UPDATE with PostgreSQL
        let contents;
        try {
            contents = await sql `
                UPDATE todos
                SET done = true
                WHERE id = ${task.id.toString()}
                RETURNING id, title, priority, due_date, done, created_at
            `

        } catch (error) {
            console.error(error);
            shutdown();
            return;
        }

        // Output result
        if (!contents.length) {
            printEmptyError(`No data with ID ${task.id.toString()} exists`, json);
            return;
        }

        if (json) {
            let jsonDict = {
                ok: true,
                todo: contents[0]
            }
            console.log(JSON.stringify(jsonDict, null, 2));
            return;
        }

        console.log(`Marked todo #${contents[0].id} as Done`)
    });

// --delete [id] - deletes a todo item
program
    .command("delete <id>")
    .description("Deletes a todo item")
    .action(async (id, options, cmd) => {
        // Parse arguments
        const { json } = cmd.optsWithGlobals();
        const result = DeleteSchema.safeParse({ id });

        if (!result.success) {
            processZodError(result, json);
            return;
        }

        const task = result.data;

        // DELETE with PostgreSQL
        let contents;
        try {
            contents = await sql `
                DELETE FROM todos
                WHERE id = ${task.id.toString()}
                RETURNING id
            `

        } catch (error) {
            console.error(error);
            shutdown();
            return;
        }

        // Output result
        if (!contents.length) {
            printEmptyError(`No data with ID ${task.id.toString()} exists`, json);
            return;
        }

        if (json) {
            let jsonDict = {
                ok: true,
                todo: contents[0]
            }
            console.log(JSON.stringify(jsonDict, null, 2));
            return;
        }

        console.log(`Deleted todo #${contents[0].id}`)
    });

await program.parseAsync(process.argv);
await sql.end();