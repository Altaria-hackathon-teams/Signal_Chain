#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Env, String, Symbol, Vec};

#[contracttype]
#[derive(Clone)]
pub struct Review {
    pub id: u64,
    pub issuer: String,
    pub asset_code: String,
    pub reviewer: String,
    pub rating: u32,
    pub text: String,
    pub trust_weight: u32,
    pub tx_amount: u64,
    pub timestamp: u64,
}

const NEXT_ID: Symbol = symbol_short!("NID");
const REVS: Symbol = symbol_short!("REVS");

fn key_for(issuer: &String) -> (Symbol, String) {
    (REVS, issuer.clone())
}

#[contract]
pub struct ReviewContract;

#[contractimpl]
impl ReviewContract {
    pub fn post_review(
        env: Env,
        issuer: String,
        asset_code: String,
        reviewer: String,
        rating: u32,
        text: String,
        trust_weight: u32,
        tx_amount: u64,
    ) -> u64 {
        if rating < 1 || rating > 5 {
            panic!("rating must be between 1 and 5");
        }

        let next_id: u64 = env.storage().instance().get(&NEXT_ID).unwrap_or(1);

        let review = Review {
            id: next_id,
            issuer: issuer.clone(),
            asset_code,
            reviewer,
            rating,
            text,
            trust_weight,
            tx_amount,
            timestamp: env.ledger().timestamp(),
        };

        let key = key_for(&issuer);
        let mut list: Vec<Review> = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| Vec::new(&env));
        list.push_back(review);
        env.storage().persistent().set(&key, &list);

        env.storage().instance().set(&NEXT_ID, &(next_id + 1));

        next_id
    }

    pub fn get_reviews(env: Env, issuer: String) -> Vec<Review> {
        let key = key_for(&issuer);
        env.storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| Vec::new(&env))
    }

    pub fn get_count(env: Env, issuer: String) -> u32 {
        let key = key_for(&issuer);
        let list: Vec<Review> = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| Vec::new(&env));
        list.len()
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::Env;

    #[test]
    fn post_and_read() {
        let env = Env::default();
        let id = env.register(ReviewContract, ());
        let client = ReviewContractClient::new(&env, &id);

        let issuer = String::from_str(&env, "GISSUER");
        let asset = String::from_str(&env, "TEST");
        let reviewer = String::from_str(&env, "GREVIEWER");
        let text = String::from_str(&env, "great");

        let id1 = client.post_review(&issuer, &asset, &reviewer, &5, &text, &100, &1000);
        let id2 = client.post_review(&issuer, &asset, &reviewer, &4, &text, &100, &500);
        assert_eq!(id1, 1);
        assert_eq!(id2, 2);
        assert_eq!(client.get_count(&issuer), 2);
    }
}
