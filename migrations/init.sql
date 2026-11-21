create type user_role as enum ('admin', 'user');
create type user_status as enum ('in_active', 'active', 'suspended', 'deleted', 'banned');
create table users (
	id int generated always as identity primary key,
	google_id text,
	facebook_id text,
	dp text,
	nm varchar(150),
	em varchar(255),
	psw varchar(255),
	phone varchar(20),
	dob date,
	role user_role not null default 'user',
	status user_status not null default 'in_active',
	lseen timestamptz,
	lock_until timestamptz,
	deleted_at timestamptz,
	stamp timestamptz not null default current_timestamp,
	modified timestamptz not null default current_timestamp
);
create index idx_u_em on users(em);
create index idx_u_phone on users(phone);
create index idx_u_dat on users(deleted_at);
create index idx_u_em_st on users(em, status);


-- create table otps(
-- 	id int generated always as identity primary key,
-- 	uid int references users(id) on delete cascade,
-- 	attempts smallint not null default 0,
-- 	kind varchar(150) not null,
-- 	token text not null, -- the otp
-- 	expiry timestamptz
-- );

create table sessions (
	id int generated always as identity primary key,
	uid int references users(id) on delete cascade,
	token text not null,
	user_agent text not null,
	geo text not null,
	einfo text not null,
	revoked_at timestamptz,
	expiry timestamptz not null,
	stamp timestamptz not null default current_timestamp
);

create table settings (
	id int generated always as identity primary key,
	okey text not null unique,
	ovalue text not null,
	comment text,
	stamp timestamptz not null default current_timestamp,
	modified timestamptz not null default current_timestamp
);


create or replace function update_modified_col()
	returns trigger as $$
		begin
			new.modified = current_timestamp;
			return new;
		end;
$$ language plpgsql;

create trigger sync_modified_time before update on users for each row execute function update_modified_col();
create trigger sync_modified_time before update on settings for each row execute function update_modified_col();