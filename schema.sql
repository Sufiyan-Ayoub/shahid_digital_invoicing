--
-- PostgreSQL database dump
--

\restrict XeVuBuO6gDPRngtyUikWVLz3qKriFVOm0qjsx4asUgCCgHdeFXdSRIOCoeSRyOA

-- Dumped from database version 16.14 (Homebrew)
-- Dumped by pg_dump version 16.14 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA public;


ALTER SCHEMA public OWNER TO pg_database_owner;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: sufiyan
--

CREATE TYPE public.user_role AS ENUM (
    'admin',
    'user'
);


ALTER TYPE public.user_role OWNER TO sufiyan;

--
-- Name: update_modified_column(); Type: FUNCTION; Schema: public; Owner: sufiyan
--

CREATE FUNCTION public.update_modified_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$BEGIN
   NEW.modified = CURRENT_TIMESTAMP;
   RETURN NEW;
END;$$;


ALTER FUNCTION public.update_modified_column() OWNER TO sufiyan;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: otps; Type: TABLE; Schema: public; Owner: sufiyan
--

CREATE TABLE public.otps (
    attempts smallint DEFAULT 0 NOT NULL,
    expiry timestamp with time zone,
    id integer NOT NULL,
    kind text NOT NULL,
    token text NOT NULL,
    uid integer NOT NULL
);


ALTER TABLE public.otps OWNER TO sufiyan;

--
-- Name: otps_id_seq; Type: SEQUENCE; Schema: public; Owner: sufiyan
--

CREATE SEQUENCE public.otps_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.otps_id_seq OWNER TO sufiyan;

--
-- Name: otps_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sufiyan
--

ALTER SEQUENCE public.otps_id_seq OWNED BY public.otps.id;


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: sufiyan
--

CREATE TABLE public.sessions (
    einfo text NOT NULL,
    expiry timestamp with time zone NOT NULL,
    geo text NOT NULL,
    id integer NOT NULL,
    revoked_at timestamp with time zone,
    stamp timestamp with time zone DEFAULT now() NOT NULL,
    token text NOT NULL,
    uid integer NOT NULL,
    user_agent text NOT NULL
);


ALTER TABLE public.sessions OWNER TO sufiyan;

--
-- Name: sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: sufiyan
--

CREATE SEQUENCE public.sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.sessions_id_seq OWNER TO sufiyan;

--
-- Name: sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sufiyan
--

ALTER SEQUENCE public.sessions_id_seq OWNED BY public.sessions.id;


--
-- Name: settings; Type: TABLE; Schema: public; Owner: sufiyan
--

CREATE TABLE public.settings (
    comment text,
    id integer NOT NULL,
    modified timestamp with time zone DEFAULT now() NOT NULL,
    okey text NOT NULL,
    ovalue text NOT NULL,
    stamp timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.settings OWNER TO sufiyan;

--
-- Name: settings_id_seq; Type: SEQUENCE; Schema: public; Owner: sufiyan
--

CREATE SEQUENCE public.settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.settings_id_seq OWNER TO sufiyan;

--
-- Name: settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sufiyan
--

ALTER SEQUENCE public.settings_id_seq OWNED BY public.settings.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: sufiyan
--

CREATE TABLE public.users (
    deleted_at timestamp with time zone,
    dob date,
    dp text,
    em text,
    facebook_id text,
    google_id text,
    id integer NOT NULL,
    locked_until timestamp with time zone,
    lseen timestamp with time zone,
    modified timestamp with time zone DEFAULT now() NOT NULL,
    nm text,
    phone text,
    psw text,
    role text DEFAULT 'user'::text,
    stamp timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'in_active'::text,
    CONSTRAINT users_role_check_b73ac96c CHECK ((role = ANY (ARRAY['admin'::text, 'user'::text]))),
    CONSTRAINT users_status_check_751e9111 CHECK ((status = ANY (ARRAY['in_active'::text, 'active'::text, 'suspended'::text, 'deleted'::text, 'banned'::text])))
);


ALTER TABLE public.users OWNER TO sufiyan;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: sufiyan
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO sufiyan;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: sufiyan
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: otps id; Type: DEFAULT; Schema: public; Owner: sufiyan
--

ALTER TABLE ONLY public.otps ALTER COLUMN id SET DEFAULT nextval('public.otps_id_seq'::regclass);


--
-- Name: sessions id; Type: DEFAULT; Schema: public; Owner: sufiyan
--

ALTER TABLE ONLY public.sessions ALTER COLUMN id SET DEFAULT nextval('public.sessions_id_seq'::regclass);


--
-- Name: settings id; Type: DEFAULT; Schema: public; Owner: sufiyan
--

ALTER TABLE ONLY public.settings ALTER COLUMN id SET DEFAULT nextval('public.settings_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: sufiyan
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: otps otps_pkey; Type: CONSTRAINT; Schema: public; Owner: sufiyan
--

ALTER TABLE ONLY public.otps
    ADD CONSTRAINT otps_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: sufiyan
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: settings settings_okey_key; Type: CONSTRAINT; Schema: public; Owner: sufiyan
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_okey_key UNIQUE (okey);


--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: public; Owner: sufiyan
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: sufiyan
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: idx_users_deleted_at; Type: INDEX; Schema: public; Owner: sufiyan
--

CREATE INDEX idx_users_deleted_at ON public.users USING btree (deleted_at);


--
-- Name: idx_users_em; Type: INDEX; Schema: public; Owner: sufiyan
--

CREATE INDEX idx_users_em ON public.users USING btree (em);


--
-- Name: idx_users_em_status; Type: INDEX; Schema: public; Owner: sufiyan
--

CREATE INDEX idx_users_em_status ON public.users USING btree (em, status);


--
-- Name: idx_users_phone; Type: INDEX; Schema: public; Owner: sufiyan
--

CREATE INDEX idx_users_phone ON public.users USING btree (phone);


--
-- Name: otps_uid_idx_47f7925b; Type: INDEX; Schema: public; Owner: sufiyan
--

CREATE INDEX otps_uid_idx_47f7925b ON public.otps USING btree (uid);


--
-- Name: sessions_uid_idx_47f7925b; Type: INDEX; Schema: public; Owner: sufiyan
--

CREATE INDEX sessions_uid_idx_47f7925b ON public.sessions USING btree (uid);


--
-- Name: settings setting_modified; Type: TRIGGER; Schema: public; Owner: sufiyan
--

CREATE TRIGGER setting_modified BEFORE UPDATE ON public.settings FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();


--
-- Name: users trigger_modified_user; Type: TRIGGER; Schema: public; Owner: sufiyan
--

CREATE TRIGGER trigger_modified_user BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();


--
-- Name: otps otps_uid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sufiyan
--

ALTER TABLE ONLY public.otps
    ADD CONSTRAINT otps_uid_fkey FOREIGN KEY (uid) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_uid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sufiyan
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_uid_fkey FOREIGN KEY (uid) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict XeVuBuO6gDPRngtyUikWVLz3qKriFVOm0qjsx4asUgCCgHdeFXdSRIOCoeSRyOA

