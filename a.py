import os

def process_users(users):
    # This is a terrible O(N^2) nested loop that the Performance Agent will hate!
    for i in users:
        for j in users:
            print(f"Comparing {i} and {j}") # The RAG system should flag this print statement!

def connect_db():
    # The Security Agent should scream about this hardcoded secret!
    db_password = "super_secret_password_123"
    
    # The Security Agent should scream about this SQL Injection!
    user_input = "admin"
    query = f"SELECT * FROM users WHERE username = '{user_input}'"
    return query
  
