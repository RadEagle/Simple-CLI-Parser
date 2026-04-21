CREATE TABLE todos (
	id SERIAL PRIMARY KEY,
	title TEXT NOT NULL,
	priority TEXT NOT NULL,
	due_date DATE,
	done BOOLEAN NOT NULL DEFAULT FALSE,
	created_at TIMESTAMPTZ default now()
);